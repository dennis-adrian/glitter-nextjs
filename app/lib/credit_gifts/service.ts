import "server-only";

import { randomUUID } from "crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  notInArray,
  sql,
} from "drizzle-orm";

import {
  type CreateCreditGiftInput,
  CREDIT_GIFT_SKIP_REASONS,
  type CreditGiftSkipReason,
  creditGiftSkipReason,
  creditGiftTotal,
  personalizeCreditGiftMessage,
  requiresTypedConfirmation,
} from "@/app/lib/credit_gifts/definitions";
import {
  getCreditBalancesInTx,
  grantCreditsInTx,
  lockCreditAccountForWriteInTx,
  reverseAdminGrantInTx,
} from "@/app/lib/credits/service";
import { roundCredits } from "@/app/lib/credits/balances";
import { isSuppressed } from "@/app/lib/emails/suppressions";
import { loggableError } from "@/app/lib/errors/loggable-error";
import { notify } from "@/app/lib/notifications/notify";
import { classifyParticipantRecipients } from "@/app/lib/participants/recipient-eligibility-queries";
import { buildInAppCopy } from "@/app/lib/notifications/registry";
import { getUserName } from "@/app/lib/users/utils";
import { db } from "@/db";
import {
  creditGiftDetails,
  notificationCampaignRecipients,
  notificationCampaigns,
  notificationDeliveries,
  notifications,
  users,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Attempts before a recipient that keeps erroring is marked failed. */
const MAX_RECIPIENT_ATTEMPTS = 3;
/** How long a "Retirar a todos" has to finish before a worker closes for it. */
const WITHDRAW_GRACE_MS = 10 * 60_000;
const DEFAULT_PROCESS_BUDGET_MS = 30_000;

export type CreateCreditGiftFailure =
  | "RECIPIENT_NOT_FOUND"
  | "NO_ELIGIBLE_RECIPIENTS"
  | "CONFIRMATION_MISMATCH"
  | "IDEMPOTENCY_CONFLICT";

export type CreateCreditGiftResult =
  | {
      ok: true;
      campaignId: number;
      eligibleCount: number;
      skippedCount: number;
      /** False when this key had already created the gift: a double submit. */
      created: boolean;
    }
  | { ok: false; code: CreateCreditGiftFailure };

function ledgerKey(campaignId: number, userId: number) {
  return `credit-gift:${campaignId}:${userId}`;
}

function revokeLedgerKey(campaignId: number, userId: number) {
  return `credit-gift-revoke:${campaignId}:${userId}`;
}

/**
 * Who among `userIds` would be skipped, and why. The composer shows it before
 * confirming; the worker asks again under the account lock, since a profile
 * can be banned or deleted in between.
 */
export async function classifyCreditGiftRecipients(
  userIds: readonly number[],
): Promise<Map<number, CreditGiftSkipReason | null>> {
  return classifyParticipantRecipients(userIds);
}

/**
 * What a submit with an already-used key gets: the gift that key created, or
 * a conflict when the terms differ. Null when no gift holds the key.
 */
async function replayCreditGift(
  input: CreateCreditGiftInput,
  actor: { id: number },
): Promise<CreateCreditGiftResult | null> {
  const [existing] = await db
    .select({
      id: notificationCampaigns.id,
      createdByUserId: notificationCampaigns.createdByUserId,
      title: notificationCampaigns.title,
      message: notificationCampaigns.message,
      amountPerRecipient: creditGiftDetails.amountPerRecipient,
      occasion: creditGiftDetails.occasion,
      internalNote: creditGiftDetails.internalNote,
    })
    .from(notificationCampaigns)
    .innerJoin(
      creditGiftDetails,
      eq(creditGiftDetails.campaignId, notificationCampaigns.id),
    )
    .where(eq(notificationCampaigns.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (!existing) return null;

  // A key reused with different terms is a different gift, not a retry.
  // The composer keeps its key after a lost response, and replaying the
  // first gift there would tell the admin an edited one went out.
  const recipientIds = await db
    .select({ userId: notificationCampaignRecipients.userId })
    .from(notificationCampaignRecipients)
    .where(eq(notificationCampaignRecipients.campaignId, existing.id));
  const sameRecipients =
    recipientIds.length === input.recipientIds.length &&
    recipientIds.every((row) => input.recipientIds.includes(row.userId));
  if (
    existing.createdByUserId !== actor.id ||
    !sameRecipients ||
    Number(existing.amountPerRecipient) !==
      roundCredits(input.amountPerRecipient) ||
    existing.title !== input.title.trim() ||
    existing.message !== input.message.trim() ||
    existing.occasion !== input.occasion ||
    existing.internalNote !== input.internalNote.trim()
  ) {
    return { ok: false, code: "IDEMPOTENCY_CONFLICT" };
  }
  const counts = await recipientCounts(existing.id);
  return {
    ok: true,
    campaignId: existing.id,
    eligibleCount: counts.total - counts.skipped,
    skippedCount: counts.skipped,
    created: false,
  };
}

/**
 * Saves a gift and one row per recipient, and returns. Nothing is credited
 * here: `processCreditGift` does that one recipient per transaction, so a
 * gift to 100 people never sits inside one request.
 *
 * The typed total is checked here as well as in the dialog. The dialog is a
 * courtesy; this is what keeps a crafted request from skipping it.
 */
export async function createCreditGift(
  input: CreateCreditGiftInput,
  actor: { id: number },
): Promise<CreateCreditGiftResult> {
  const replay = await replayCreditGift(input, actor);
  if (replay) return replay;

  const reasons = await classifyCreditGiftRecipients(input.recipientIds);
  if (reasons.size !== input.recipientIds.length) {
    return { ok: false, code: "RECIPIENT_NOT_FOUND" };
  }
  const eligible = input.recipientIds.filter((id) => !reasons.get(id));
  if (eligible.length === 0) {
    return { ok: false, code: "NO_ELIGIBLE_RECIPIENTS" };
  }

  const total = creditGiftTotal(input.amountPerRecipient, eligible.length);
  if (
    requiresTypedConfirmation(total) &&
    (input.confirmedTotal == null ||
      roundCredits(input.confirmedTotal) !== total)
  ) {
    return { ok: false, code: "CONFIRMATION_MISMATCH" };
  }

  const campaignId = await db.transaction(async (tx) => {
    // A double submit that got past the lookup above waits here for the
    // first to commit, then inserts nothing.
    const [campaign] = await tx
      .insert(notificationCampaigns)
      .values({
        type: "credit_gift",
        title: input.title.trim(),
        message: input.message.trim(),
        createdByUserId: actor.id,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing({ target: notificationCampaigns.idempotencyKey })
      .returning({ id: notificationCampaigns.id });
    if (!campaign) return null;

    await tx.insert(creditGiftDetails).values({
      campaignId: campaign.id,
      amountPerRecipient: roundCredits(input.amountPerRecipient),
      occasion: input.occasion,
      internalNote: input.internalNote.trim(),
    });

    await tx.insert(notificationCampaignRecipients).values(
      input.recipientIds.map((userId) => {
        const reason = reasons.get(userId) ?? null;
        return {
          campaignId: campaign.id,
          userId,
          status: reason ? ("skipped" as const) : ("pending" as const),
          skippedReason: reason ? CREDIT_GIFT_SKIP_REASONS[reason] : null,
          processedAt: reason ? new Date() : null,
        };
      }),
    );
    return campaign.id;
  });
  if (campaignId == null) {
    const replay = await replayCreditGift(input, actor);
    if (!replay) throw new Error("credit_gift_idempotency_key_taken");
    return replay;
  }

  return {
    ok: true,
    campaignId,
    eligibleCount: eligible.length,
    skippedCount: input.recipientIds.length - eligible.length,
    created: true,
  };
}

async function recipientCounts(campaignId: number) {
  const rows = await db
    .select({
      status: notificationCampaignRecipients.status,
      revoked: sql<boolean>`${notificationCampaignRecipients.revokedAt} IS NOT NULL`,
      count: count(),
    })
    .from(notificationCampaignRecipients)
    .where(eq(notificationCampaignRecipients.campaignId, campaignId))
    .groupBy(
      notificationCampaignRecipients.status,
      sql`${notificationCampaignRecipients.revokedAt} IS NOT NULL`,
    );
  const counts = {
    pending: 0,
    /** Granted and still holding it. */
    granted: 0,
    /** Granted, then taken back. */
    revoked: 0,
    skipped: 0,
    failed: 0,
    total: 0,
  };
  for (const row of rows) {
    const n = Number(row.count);
    counts.total += n;
    if (row.status === "granted") {
      if (row.revoked) counts.revoked += n;
      else counts.granted += n;
    } else {
      counts[row.status] += n;
    }
  }
  return counts;
}

type GiftForProcessing = {
  id: number;
  title: string;
  message: string;
  amountPerRecipient: number;
  occasion: string;
  internalNote: string;
  createdByUserId: number | null;
};

async function loadGift(campaignId: number): Promise<GiftForProcessing | null> {
  const [row] = await db
    .select({
      id: notificationCampaigns.id,
      title: notificationCampaigns.title,
      message: notificationCampaigns.message,
      createdByUserId: notificationCampaigns.createdByUserId,
      amountPerRecipient: creditGiftDetails.amountPerRecipient,
      occasion: creditGiftDetails.occasion,
      internalNote: creditGiftDetails.internalNote,
    })
    .from(notificationCampaigns)
    .innerJoin(
      creditGiftDetails,
      eq(creditGiftDetails.campaignId, notificationCampaigns.id),
    )
    .where(
      and(
        eq(notificationCampaigns.id, campaignId),
        eq(notificationCampaigns.type, "credit_gift"),
      ),
    )
    .limit(1);
  return row
    ? { ...row, amountPerRecipient: Number(row.amountPerRecipient) }
    : null;
}

type RecipientStep =
  | { done: true }
  | {
      done: false;
      recipientId: number;
      /** "contended": another worker, or a revoke-all, got there first. */
      outcome: "granted" | "skipped" | "contended";
      deliveryIds: readonly number[];
    };

/**
 * Credits the next pending recipient, all in one transaction: the grant, the
 * inbox item, the email row and the recipient's state commit together.
 *
 * Locks follow the canonical order: the user, then the credit account, then
 * the recipient row. Profile deletion holds the user lock while its delete
 * cascades onto recipient rows, so taking the recipient first could deadlock
 * with it. The candidate is therefore picked without a lock and re-checked
 * once locked; a worker that loses the race moves on. The ledger key is what
 * makes a double grant impossible even so.
 */
async function processNextRecipient(
  gift: GiftForProcessing,
  /** Set as soon as a row is claimed, so a failure can be pinned on it. */
  claimed: { recipientId: number | null },
  /** Rows this run already lost to someone else, so it does not spin on them. */
  passed: ReadonlySet<number>,
): Promise<RecipientStep> {
  const [candidate] = await db
    .select({
      id: notificationCampaignRecipients.id,
      userId: notificationCampaignRecipients.userId,
    })
    .from(notificationCampaignRecipients)
    .where(
      and(
        eq(notificationCampaignRecipients.campaignId, gift.id),
        eq(notificationCampaignRecipients.status, "pending"),
        passed.size > 0
          ? notInArray(notificationCampaignRecipients.id, [...passed])
          : undefined,
      ),
    )
    .orderBy(asc(notificationCampaignRecipients.id))
    .limit(1);
  if (!candidate) return { done: true } as const;
  claimed.recipientId = candidate.id;

  return db.transaction(async (tx) => {
    const writable = await lockCreditAccountForWriteInTx(tx, candidate.userId);
    const [recipient] = await tx
      .select({
        id: notificationCampaignRecipients.id,
        userId: notificationCampaignRecipients.userId,
        attempts: notificationCampaignRecipients.attempts,
      })
      .from(notificationCampaignRecipients)
      .where(
        and(
          eq(notificationCampaignRecipients.id, candidate.id),
          eq(notificationCampaignRecipients.status, "pending"),
        ),
      )
      .limit(1)
      .for("update", { skipLocked: true });
    if (!recipient) {
      return {
        done: false,
        recipientId: candidate.id,
        outcome: "contended",
        deliveryIds: [],
      } as const;
    }

    const skip = async (reason: CreditGiftSkipReason) => {
      await tx
        .update(notificationCampaignRecipients)
        .set({
          status: "skipped",
          skippedReason: CREDIT_GIFT_SKIP_REASONS[reason],
          attempts: recipient.attempts + 1,
          processedAt: new Date(),
        })
        .where(eq(notificationCampaignRecipients.id, recipient.id));
      return {
        done: false,
        recipientId: recipient.id,
        outcome: "skipped",
        deliveryIds: [],
      } as const;
    };

    if (!writable) return skip("deletion_pending");
    const [user] = await tx
      .select({
        id: users.id,
        role: users.role,
        status: users.status,
        email: users.email,
        displayName: users.displayName,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(eq(users.id, recipient.userId))
      .limit(1);
    if (!user) return skip("not_participant");
    const reason = creditGiftSkipReason(user);
    if (reason) return skip(reason);

    const grant = await grantCreditsInTx(tx, {
      userId: user.id,
      amount: gift.amountPerRecipient,
      reason: gift.title,
      idempotencyKey: ledgerKey(gift.id, user.id),
      // Lets Finanzas tell a gift (a cost) from a refund paid as credits.
      metadata: {
        creditGiftId: String(gift.id),
        occasion: gift.occasion,
        internalNote: gift.internalNote,
      },
    });
    if (!grant) throw new Error("credit_gift_ledger_key_conflict");

    const name = getUserName(user) || null;
    const notified = await notify(tx, {
      userId: user.id,
      kind: "credit_gift_received",
      data: {
        campaignId: gift.id,
        name,
        amount: gift.amountPerRecipient,
        title: gift.title,
        message: personalizeCreditGiftMessage(gift.message, name),
      },
      dedupeKey: `credit-gift:${gift.id}`,
      campaignId: gift.id,
      email: user.email,
    });

    await tx
      .update(notificationCampaignRecipients)
      .set({
        status: "granted",
        ledgerEntryId: grant.ledgerEntryId,
        notificationId: notified.notificationId,
        attempts: recipient.attempts + 1,
        lastError: null,
        processedAt: new Date(),
      })
      .where(eq(notificationCampaignRecipients.id, recipient.id));

    return {
      done: false,
      recipientId: recipient.id,
      outcome: "granted",
      deliveryIds: notified.deliveryIds,
    } as const;
  });
}

/**
 * A log-safe label for an error: our own codes as they are, anything else by
 * name and Postgres code, never a message that could carry row data.
 */
function failureLabel(error: unknown): string {
  if (error instanceof Error && /^[a-z_:0-9]+$/.test(error.message)) {
    return error.message;
  }
  // Drizzle wraps every failed query; the Postgres code is on its cause.
  const { name, code } = loggableError(error);
  return code ? `${name}:${code}` : name;
}

/**
 * Records that a recipient errored. Under the attempt cap it stays pending for
 * the cron; the current run stops either way, so one bad row cannot spin a
 * worker through its whole budget.
 */
async function recordRecipientFailure(recipientId: number, error: unknown) {
  await db
    .update(notificationCampaignRecipients)
    .set({
      attempts: sql`${notificationCampaignRecipients.attempts} + 1`,
      lastError: failureLabel(error).slice(0, 180),
      status: sql`CASE WHEN ${notificationCampaignRecipients.attempts} + 1 >= ${MAX_RECIPIENT_ATTEMPTS} THEN 'failed'::notification_campaign_recipient_status ELSE ${notificationCampaignRecipients.status} END`,
      processedAt: sql`CASE WHEN ${notificationCampaignRecipients.attempts} + 1 >= ${MAX_RECIPIENT_ATTEMPTS} THEN now() ELSE ${notificationCampaignRecipients.processedAt} END`,
    })
    .where(
      and(
        eq(notificationCampaignRecipients.id, recipientId),
        eq(notificationCampaignRecipients.status, "pending"),
      ),
    );
}

/**
 * Closes a gift once nobody is pending, and tells the admin who sent it. The
 * conditional update lets only one worker do it.
 */
async function completeGiftIfDone(
  gift: GiftForProcessing,
  /** Set by "Retirar a todos" itself, once its revocations are done. */
  { byRevokeAll = false }: { byRevokeAll?: boolean } = {},
) {
  const counts = await recipientCounts(gift.id);
  if (counts.pending > 0) return { completed: false, deliveryIds: [] };

  // A "Retirar a todos" leaves its mark on the people it cancelled. While it
  // is recent, the revoke is probably still taking the gift back from the
  // others, and closing now would report counts from before that. The revoke
  // closes the gift itself when it finishes; past the grace period (it died
  // halfway), whoever comes next closes it as withdrawn.
  const [withdrawal] = await db
    .select({
      cancelled: sql<number>`count(*)::int`,
      recent: sql<boolean>`coalesce(bool_or(${notificationCampaignRecipients.processedAt} > now() - make_interval(secs => ${WITHDRAW_GRACE_MS / 1000})), false)`,
    })
    .from(notificationCampaignRecipients)
    .where(
      and(
        eq(notificationCampaignRecipients.campaignId, gift.id),
        eq(
          notificationCampaignRecipients.skippedReason,
          CREDIT_GIFT_SKIP_REASONS.cancelled,
        ),
      ),
    );
  if (!byRevokeAll && withdrawal?.recent) {
    return { completed: false, deliveryIds: [] };
  }
  const withdrawn = byRevokeAll || Number(withdrawal?.cancelled ?? 0) > 0;

  return db.transaction(async (tx) => {
    const [closed] = await tx
      .update(notificationCampaigns)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(notificationCampaigns.id, gift.id),
          eq(notificationCampaigns.status, "processing"),
        ),
      )
      .returning({ id: notificationCampaigns.id });
    if (!closed) return { completed: false, deliveryIds: [] };

    if (gift.createdByUserId != null) {
      await notify(tx, {
        userId: gift.createdByUserId,
        kind: "credit_gift_completed",
        data: {
          campaignId: gift.id,
          title: gift.title,
          withdrawn,
          granted: counts.granted,
          revoked: counts.revoked,
          skipped: counts.skipped,
          failed: counts.failed,
          // What participants still hold, not what was ever credited.
          totalGranted: creditGiftTotal(
            gift.amountPerRecipient,
            counts.granted,
          ),
        },
        dedupeKey: `credit-gift-completed:${gift.id}`,
        campaignId: gift.id,
      });
    }
    return { completed: true, deliveryIds: [] };
  });
}

export type ProcessCreditGiftResult = {
  granted: number;
  skipped: number;
  failed: boolean;
  completed: boolean;
  deliveryIds: number[];
};

/**
 * Works through a gift's pending recipients until none is left or the budget
 * runs out. Safe to run concurrently and to resume after a crash.
 */
export async function processCreditGift(
  campaignId: number,
  { budgetMs = DEFAULT_PROCESS_BUDGET_MS }: { budgetMs?: number } = {},
): Promise<ProcessCreditGiftResult> {
  const result: ProcessCreditGiftResult = {
    granted: 0,
    skipped: 0,
    failed: false,
    completed: false,
    deliveryIds: [],
  };
  const gift = await loadGift(campaignId);
  if (!gift) return result;

  const startedAt = Date.now();
  const passed = new Set<number>();
  while (Date.now() - startedAt < budgetMs) {
    let step: RecipientStep;
    const claimed = { recipientId: null as number | null };
    try {
      step = await processNextRecipient(gift, claimed, passed);
    } catch (error) {
      console.error("Credit gift recipient failed", {
        campaignId,
        errorType: failureLabel(error),
      });
      if (claimed.recipientId != null) {
        await recordRecipientFailure(claimed.recipientId, error).catch(
          () => undefined,
        );
      }
      result.failed = true;
      break;
    }
    if (step.done) break;
    if (step.outcome === "contended") {
      passed.add(step.recipientId);
      continue;
    }
    if (step.outcome === "granted") result.granted += 1;
    else result.skipped += 1;
    result.deliveryIds.push(...step.deliveryIds);
  }

  const completion = await completeGiftIfDone(gift);
  result.completed = completion.completed;
  return result;
}

/** The cron's half: every gift still processing, oldest first. */
export async function resumeProcessingCreditGifts({
  budgetMs = DEFAULT_PROCESS_BUDGET_MS,
}: { budgetMs?: number } = {}) {
  const rows = await db
    .select({ id: notificationCampaigns.id })
    .from(notificationCampaigns)
    .where(
      and(
        eq(notificationCampaigns.type, "credit_gift"),
        eq(notificationCampaigns.status, "processing"),
      ),
    )
    .orderBy(asc(notificationCampaigns.createdAt))
    .limit(10);

  const startedAt = Date.now();
  const deliveryIds: number[] = [];
  let granted = 0;
  for (const row of rows) {
    const remaining = budgetMs - (Date.now() - startedAt);
    if (remaining <= 0) break;
    const outcome = await processCreditGift(row.id, { budgetMs: remaining });
    granted += outcome.granted;
    deliveryIds.push(...outcome.deliveryIds);
  }
  return { gifts: rows.length, granted, deliveryIds };
}

export type RevokeCreditGiftResult = {
  revoked: number;
  /** Recipients not yet credited, who now never will be. */
  cancelled: number;
  /** Recipients whose balance went below zero with the reversal. */
  negative: number;
  failed: number;
  deliveryIds: number[];
};

/**
 * Takes a gift back from some recipients, or from all of them, one
 * transaction each: the linked reversal, the neutral notice and its email,
 * the unsent gift email and the cancelled celebration commit together.
 *
 * Taking it back from everyone also stops it from reaching whoever the worker
 * has not credited yet. That runs first: a recipient the worker is crediting
 * right now keeps its lock until it commits, so it ends up either cancelled
 * here or credited and then revoked below, never credited after the fact.
 *
 * A balance can go negative, which blocks credit use until regularized; the
 * dialog warns before this runs and the debt report picks it up after.
 */
export async function revokeCreditGift(input: {
  campaignId: number;
  /** Omit to revoke every recipient who still holds the gift. */
  userIds?: readonly number[];
  actorId: number;
}): Promise<RevokeCreditGiftResult | null> {
  const gift = await loadGift(input.campaignId);
  if (!gift) return null;

  let cancelled = 0;
  if (!input.userIds) {
    const rows = await db
      .update(notificationCampaignRecipients)
      .set({
        status: "skipped",
        skippedReason: CREDIT_GIFT_SKIP_REASONS.cancelled,
        processedAt: new Date(),
      })
      .where(
        and(
          eq(notificationCampaignRecipients.campaignId, gift.id),
          eq(notificationCampaignRecipients.status, "pending"),
        ),
      )
      .returning({ id: notificationCampaignRecipients.id });
    cancelled = rows.length;
  }

  const targets = await db
    .select({ userId: notificationCampaignRecipients.userId })
    .from(notificationCampaignRecipients)
    .where(
      and(
        eq(notificationCampaignRecipients.campaignId, gift.id),
        eq(notificationCampaignRecipients.status, "granted"),
        isNull(notificationCampaignRecipients.revokedAt),
        input.userIds
          ? inArray(notificationCampaignRecipients.userId, [...input.userIds])
          : undefined,
      ),
    )
    .orderBy(asc(notificationCampaignRecipients.userId));

  const result: RevokeCreditGiftResult = {
    revoked: 0,
    cancelled,
    negative: 0,
    failed: 0,
    deliveryIds: [],
  };
  for (const { userId } of targets) {
    try {
      const outcome = await db.transaction((tx) =>
        revokeRecipientInTx(tx, gift, userId, input.actorId),
      );
      if (!outcome) continue;
      result.revoked += 1;
      if (outcome.negative) result.negative += 1;
      result.deliveryIds.push(...outcome.deliveryIds);
    } catch (error) {
      console.error("Credit gift revocation failed", {
        campaignId: gift.id,
        errorType: failureLabel(error),
      });
      result.failed += 1;
    }
  }
  // Closed here, after the revocations, so the sender's summary counts them.
  // If someone closed it first (a worker finishing its last grant as the
  // click landed, or a gift that was already complete), the summary they
  // wrote predates the revocations, so it is rewritten as withdrawn.
  if (!input.userIds) {
    const closed = await completeGiftIfDone(gift, { byRevokeAll: true });
    if (!closed.completed) await rewriteSummaryAsWithdrawn(gift);
  }
  return result;
}

/**
 * Brings the sender's existing summary in line with a "Retirar a todos" that
 * ran after it was written, and marks it unread so the change is seen. Does
 * nothing when there is no summary yet (the gift is still open).
 */
async function rewriteSummaryAsWithdrawn(gift: GiftForProcessing) {
  if (gift.createdByUserId == null) return;
  const counts = await recipientCounts(gift.id);
  const data = {
    campaignId: gift.id,
    title: gift.title,
    withdrawn: true,
    granted: counts.granted,
    revoked: counts.revoked,
    skipped: counts.skipped,
    failed: counts.failed,
    totalGranted: creditGiftTotal(gift.amountPerRecipient, counts.granted),
  };
  const copy = buildInAppCopy("credit_gift_completed", data);
  await db
    .update(notifications)
    .set({ title: copy.title, body: copy.body, data, readAt: null })
    .where(
      and(
        eq(notifications.userId, gift.createdByUserId),
        eq(notifications.dedupeKey, `credit-gift-completed:${gift.id}`),
      ),
    );
}

async function revokeRecipientInTx(
  tx: DbTx,
  gift: GiftForProcessing,
  userId: number,
  actorId: number,
) {
  // The user and account first, then the recipient row: the same order the
  // worker and profile deletion take them in. Deletion is refused while a
  // ledger entry exists, so a false here is a deletion that is already
  // failing; the revocation waits for it to clear.
  if (!(await lockCreditAccountForWriteInTx(tx, userId))) {
    throw new Error("credit_gift_revoke_deletion_pending");
  }

  const [recipient] = await tx
    .select({
      id: notificationCampaignRecipients.id,
      status: notificationCampaignRecipients.status,
      ledgerEntryId: notificationCampaignRecipients.ledgerEntryId,
      notificationId: notificationCampaignRecipients.notificationId,
      revokedAt: notificationCampaignRecipients.revokedAt,
    })
    .from(notificationCampaignRecipients)
    .where(
      and(
        eq(notificationCampaignRecipients.campaignId, gift.id),
        eq(notificationCampaignRecipients.userId, userId),
      ),
    )
    .limit(1)
    .for("update");
  // Re-checked under the row lock: a second admin may have just revoked it.
  if (
    !recipient ||
    recipient.status !== "granted" ||
    recipient.revokedAt ||
    recipient.ledgerEntryId == null
  ) {
    return null;
  }

  const reversal = await reverseAdminGrantInTx(tx, {
    userId,
    grantEntryId: recipient.ledgerEntryId,
    reason: `Regalo retirado: ${gift.title}`,
    idempotencyKey: revokeLedgerKey(gift.id, userId),
    adminUserId: actorId,
    metadata: { creditGiftId: String(gift.id) },
  });
  if (!reversal.ok) {
    // Lower-cased so failureLabel logs it as one of our codes.
    throw new Error(`credit_gift_revoke_${reversal.code.toLowerCase()}`);
  }

  const balances = await getCreditBalancesInTx(tx, userId);
  const debtAmount = Math.max(0, roundCredits(-balances.ledgerBalance));

  const [user] = await tx
    .select({
      email: users.email,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const notified = await notify(tx, {
    userId,
    kind: "credit_gift_revoked",
    data: {
      campaignId: gift.id,
      name: getUserName(user) || null,
      amount: gift.amountPerRecipient,
      title: gift.title,
      debtAmount,
    },
    dedupeKey: `credit-gift-revoked:${gift.id}`,
    campaignId: gift.id,
    email: user?.email,
  });

  // A banner, or a "Recibiste…" email still waiting its turn, for a gift that
  // is gone would celebrate credits the person no longer has. One already
  // handed to Resend cannot be called back.
  if (recipient.notificationId != null) {
    await tx
      .update(notifications)
      .set({ celebratedAt: new Date() })
      .where(
        and(
          eq(notifications.id, recipient.notificationId),
          isNull(notifications.celebratedAt),
        ),
      );
    await tx
      .update(notificationDeliveries)
      .set({ status: "skipped", lastError: "revoked", updatedAt: new Date() })
      .where(
        and(
          eq(notificationDeliveries.notificationId, recipient.notificationId),
          eq(notificationDeliveries.status, "pending"),
        ),
      );
  }

  await tx
    .update(notificationCampaignRecipients)
    .set({
      reversalEntryId: reversal.data.ledgerEntryId,
      revokedAt: new Date(),
      revokedByUserId: actorId,
    })
    .where(eq(notificationCampaignRecipients.id, recipient.id));

  return { negative: debtAmount > 0, deliveryIds: notified.deliveryIds };
}

export type ResendGiftNotificationResult =
  | { ok: true; deliveryId: number }
  | {
      ok: false;
      code: "NOT_GRANTED" | "NO_EMAIL" | "EMAIL_PENDING" | "SUPPRESSED";
    };

/**
 * Mails a recipient's gift notice again, to the address on file now. It never
 * grants again: the new row only re-delivers the snapshot the inbox already
 * holds, under a key of its own so Resend does not fold it into the first.
 *
 * The checks and the insert share one transaction holding the recipient row,
 * taken after the user and account like everywhere else: a revocation, or a
 * second click from another tab, waits for it instead of slipping between
 * "still holds the gift" and the new email.
 */
export async function resendCreditGiftNotification(input: {
  campaignId: number;
  userId: number;
  actorId: number;
}): Promise<ResendGiftNotificationResult> {
  return db.transaction(async (tx) => {
    if (!(await lockCreditAccountForWriteInTx(tx, input.userId))) {
      return { ok: false, code: "NOT_GRANTED" } as const;
    }
    const [recipient] = await tx
      .select({
        status: notificationCampaignRecipients.status,
        notificationId: notificationCampaignRecipients.notificationId,
        revokedAt: notificationCampaignRecipients.revokedAt,
      })
      .from(notificationCampaignRecipients)
      .where(
        and(
          eq(notificationCampaignRecipients.campaignId, input.campaignId),
          eq(notificationCampaignRecipients.userId, input.userId),
        ),
      )
      .limit(1)
      .for("update");
    if (
      !recipient ||
      recipient.status !== "granted" ||
      recipient.revokedAt ||
      recipient.notificationId == null
    ) {
      return { ok: false, code: "NOT_GRANTED" } as const;
    }

    const [row] = await tx
      .select({
        kind: notifications.kind,
        data: notifications.data,
        email: users.email,
      })
      .from(notifications)
      .innerJoin(users, eq(users.id, notifications.userId))
      .where(eq(notifications.id, recipient.notificationId))
      .limit(1);
    if (!row) return { ok: false, code: "NOT_GRANTED" } as const;
    const email = row.email?.trim();
    if (!email) return { ok: false, code: "NO_EMAIL" } as const;

    const [previous] = await tx
      .select({
        id: notificationDeliveries.id,
        status: notificationDeliveries.status,
      })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.notificationId, recipient.notificationId),
          eq(notificationDeliveries.channel, "email"),
        ),
      )
      .orderBy(desc(notificationDeliveries.id))
      .limit(1);
    // The last email is still on its way: another now would arrive twice.
    if (previous?.status === "pending" || previous?.status === "processing") {
      return { ok: false, code: "EMAIL_PENDING" } as const;
    }
    // A bounced or reported address gets nothing, so "reenviado" would lie.
    if (await isSuppressed(email, tx)) {
      return { ok: false, code: "SUPPRESSED" } as const;
    }

    const [delivery] = await tx
      .insert(notificationDeliveries)
      .values({
        notificationId: recipient.notificationId,
        userId: input.userId,
        templateKey: row.kind,
        // "Reenviar aviso" re-sends the email only.
        channel: "email",
        recipientEmail: email,
        payload: row.data,
        idempotencyKey: `notification:${recipient.notificationId}:resend:${randomUUID()}`,
        resendOfDeliveryId: previous?.id ?? null,
        requestedByUserId: input.actorId,
      })
      .returning({ id: notificationDeliveries.id });
    if (!delivery) throw new Error("credit_gift_resend_insert_failed");
    return { ok: true, deliveryId: delivery.id } as const;
  });
}
