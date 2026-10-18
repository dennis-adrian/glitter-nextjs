import "server-only";

import { randomUUID } from "crypto";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";

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
import { notify } from "@/app/lib/notifications/notify";
import { getUserName } from "@/app/lib/users/utils";
import { db } from "@/db";
import {
  creditGiftDetails,
  notificationCampaignRecipients,
  notificationCampaigns,
  notificationDeliveries,
  notifications,
  pendingUserDeletions,
  users,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Attempts before a recipient that keeps erroring is marked failed. */
const MAX_RECIPIENT_ATTEMPTS = 3;
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

async function pendingDeletionUserIds(
  executor: Pick<typeof db, "select">,
  userIds: readonly number[],
) {
  if (userIds.length === 0) return new Set<number>();
  const rows = await executor
    .select({ userId: pendingUserDeletions.userId })
    .from(pendingUserDeletions)
    .where(
      and(
        inArray(pendingUserDeletions.userId, [...userIds]),
        isNull(pendingUserDeletions.localDeletedAt),
      ),
    );
  return new Set(
    rows.map((row) => row.userId).filter((id): id is number => id != null),
  );
}

/**
 * Who among `userIds` would be skipped, and why. The composer shows it before
 * confirming; the worker asks again under the account lock, since a profile
 * can be banned or deleted in between.
 */
export async function classifyCreditGiftRecipients(userIds: readonly number[]) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) {
    return new Map<number, CreditGiftSkipReason | null>();
  }
  const [rows, deleting] = await Promise.all([
    db
      .select({ id: users.id, role: users.role, status: users.status })
      .from(users)
      .where(inArray(users.id, unique)),
    pendingDeletionUserIds(db, unique),
  ]);
  const reasons = new Map<number, CreditGiftSkipReason | null>();
  for (const row of rows) {
    reasons.set(
      row.id,
      deleting.has(row.id) ? "deletion_pending" : creditGiftSkipReason(row),
    );
  }
  return reasons;
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
  const [existing] = await db
    .select({
      id: notificationCampaigns.id,
      createdByUserId: notificationCampaigns.createdByUserId,
    })
    .from(notificationCampaigns)
    .where(eq(notificationCampaigns.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (existing) {
    if (existing.createdByUserId !== actor.id) {
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
    const [campaign] = await tx
      .insert(notificationCampaigns)
      .values({
        type: "credit_gift",
        title: input.title.trim(),
        message: input.message.trim(),
        createdByUserId: actor.id,
        idempotencyKey: input.idempotencyKey,
      })
      .returning({ id: notificationCampaigns.id });
    if (!campaign) throw new Error("credit_gift_insert_failed");

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
      count: count(),
    })
    .from(notificationCampaignRecipients)
    .where(eq(notificationCampaignRecipients.campaignId, campaignId))
    .groupBy(notificationCampaignRecipients.status);
  const byStatus = Object.fromEntries(
    rows.map((row) => [row.status, Number(row.count)]),
  ) as Partial<Record<string, number>>;
  const pending = byStatus.pending ?? 0;
  const granted = byStatus.granted ?? 0;
  const skipped = byStatus.skipped ?? 0;
  const failed = byStatus.failed ?? 0;
  return {
    pending,
    granted,
    skipped,
    failed,
    total: pending + granted + skipped + failed,
  };
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
      outcome: "granted" | "skipped";
      deliveryIds: readonly number[];
    };

/**
 * Credits the next pending recipient, all in one transaction: the grant, the
 * inbox item, the email row and the recipient's state commit together.
 *
 * `SKIP LOCKED` lets the request's worker and the cron split a gift instead of
 * queueing behind each other. The ledger key is what makes a double grant
 * impossible even so.
 */
async function processNextRecipient(
  gift: GiftForProcessing,
  /** Set as soon as a row is claimed, so a failure can be pinned on it. */
  claimed: { recipientId: number | null },
): Promise<RecipientStep> {
  return db.transaction(async (tx) => {
    const [recipient] = await tx
      .select({
        id: notificationCampaignRecipients.id,
        userId: notificationCampaignRecipients.userId,
        attempts: notificationCampaignRecipients.attempts,
      })
      .from(notificationCampaignRecipients)
      .where(
        and(
          eq(notificationCampaignRecipients.campaignId, gift.id),
          eq(notificationCampaignRecipients.status, "pending"),
        ),
      )
      .orderBy(asc(notificationCampaignRecipients.id))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!recipient) return { done: true } as const;
    claimed.recipientId = recipient.id;

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

    if (!(await lockCreditAccountForWriteInTx(tx, recipient.userId))) {
      return skip("deletion_pending");
    }
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
  if (error instanceof Error) {
    if (/^[a-z_:0-9]+$/.test(error.message)) return error.message;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? `${error.name}:${code}` : error.name;
  }
  return typeof error;
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
async function completeGiftIfDone(gift: GiftForProcessing) {
  const counts = await recipientCounts(gift.id);
  if (counts.pending > 0) return { completed: false, deliveryIds: [] };

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
          granted: counts.granted,
          skipped: counts.skipped,
          failed: counts.failed,
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
  while (Date.now() - startedAt < budgetMs) {
    let step: RecipientStep;
    const claimed = { recipientId: null as number | null };
    try {
      step = await processNextRecipient(gift, claimed);
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
  /** Recipients whose balance went below zero with the reversal. */
  negative: number;
  failed: number;
  deliveryIds: number[];
};

/**
 * Takes a gift back from some recipients, or from all of them, one
 * transaction each: the linked reversal, the neutral notice and its email,
 * and the cancelled celebration commit together.
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
  return result;
}

async function revokeRecipientInTx(
  tx: DbTx,
  gift: GiftForProcessing,
  userId: number,
  actorId: number,
) {
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

  // Deletion is refused while a ledger entry exists, so this only trips on a
  // deletion that is already failing; the reversal waits for it to clear.
  if (!(await lockCreditAccountForWriteInTx(tx, userId))) {
    throw new Error("credit_gift_revoke_deletion_pending");
  }

  const reversal = await reverseAdminGrantInTx(tx, {
    userId,
    grantEntryId: recipient.ledgerEntryId,
    reason: `Regalo retirado: ${gift.title}`,
    idempotencyKey: revokeLedgerKey(gift.id, userId),
    adminUserId: actorId,
    metadata: { creditGiftId: String(gift.id) },
  });
  if (!reversal.ok) throw new Error(`credit_gift_revoke_${reversal.code}`);

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

  // A banner for a gift that is gone would celebrate credits the person no
  // longer has.
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
  | { ok: false; code: "NOT_GRANTED" | "NO_EMAIL" };

/**
 * Mails a recipient's gift notice again, to the address on file now. It never
 * grants again: the new row only re-delivers the snapshot the inbox already
 * holds, under a key of its own so Resend does not fold it into the first.
 */
export async function resendCreditGiftNotification(input: {
  campaignId: number;
  userId: number;
  actorId: number;
}): Promise<ResendGiftNotificationResult> {
  const [row] = await db
    .select({
      status: notificationCampaignRecipients.status,
      notificationId: notificationCampaignRecipients.notificationId,
      revokedAt: notificationCampaignRecipients.revokedAt,
      kind: notifications.kind,
      data: notifications.data,
      email: users.email,
    })
    .from(notificationCampaignRecipients)
    .innerJoin(
      notifications,
      eq(notifications.id, notificationCampaignRecipients.notificationId),
    )
    .innerJoin(users, eq(users.id, notificationCampaignRecipients.userId))
    .where(
      and(
        eq(notificationCampaignRecipients.campaignId, input.campaignId),
        eq(notificationCampaignRecipients.userId, input.userId),
      ),
    )
    .limit(1);
  if (
    !row ||
    row.status !== "granted" ||
    row.revokedAt ||
    row.notificationId == null
  ) {
    return { ok: false, code: "NOT_GRANTED" };
  }
  if (!row.email?.trim()) return { ok: false, code: "NO_EMAIL" };

  const [previous] = await db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.notificationId, row.notificationId))
    .orderBy(sql`${notificationDeliveries.createdAt} desc`)
    .limit(1);

  const [delivery] = await db
    .insert(notificationDeliveries)
    .values({
      notificationId: row.notificationId,
      userId: input.userId,
      templateKey: row.kind,
      recipientEmail: row.email.trim(),
      payload: row.data,
      idempotencyKey: `notification:${row.notificationId}:resend:${randomUUID()}`,
      resendOfDeliveryId: previous?.id ?? null,
      requestedByUserId: input.actorId,
    })
    .returning({ id: notificationDeliveries.id });
  if (!delivery) throw new Error("credit_gift_resend_insert_failed");
  return { ok: true, deliveryId: delivery.id };
}
