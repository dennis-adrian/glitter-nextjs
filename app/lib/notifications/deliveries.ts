import "server-only";

import { randomUUID } from "crypto";
import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { after } from "next/server";

import { isSuppressed } from "@/app/lib/emails/suppressions";
import { pushVapidConfig } from "@/app/lib/notifications/push/config";
import {
  attemptPushDelivery,
  type PushDeliveryResult,
} from "@/app/lib/notifications/push/send";
import { buildEmailCopy } from "@/app/lib/notifications/registry";
import { sendEmail } from "@/app/vendors/resend";
import {
  assertSent,
  EmailSendError,
  sendFailureType,
} from "@/app/vendors/resend-result";
import { db } from "@/db";
import {
  notificationCampaignRecipients,
  notificationDeliveries,
  notifications,
} from "@/db/schema";

const MAX_ATTEMPTS = 5;
const LEASE_DURATION_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;
/**
 * Gap before each email while draining. Resend limits requests per second per
 * team, and a gift to 100 people would otherwise fire 100 at once and spend
 * its retries on `rate_limit_exceeded`. Pushes go to many push services and
 * are not spaced.
 */
const SEND_SPACING_MS = 600;
/** What a drain may spend sending, inside the 100-second function limit. */
const DEFAULT_DRAIN_BUDGET_MS = 60_000;
/** Pushes a bulk send keeps in flight at once (D5 of the comunicados design). */
export const BULK_PUSH_CONCURRENCY = 8;

export type DeliveryOutcome =
  | { processed: false }
  | { processed: true; status: "sent" | "skipped" | "retry" | "failed" };

/** A push service's Retry-After wins when it asks for longer than backoff. */
function computeNextAttemptAt(
  attempts: number,
  now: Date,
  retryAfterMs: number | null = null,
) {
  const delay = Math.min(
    MAX_BACKOFF_MS,
    Math.max(30_000 * 2 ** Math.max(0, attempts - 1), retryAfterMs ?? 0),
  );
  return new Date(now.getTime() + delay);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Due-ness is judged by the database's clock, the same one that stamped
 * `next_attempt_at` on insert. Comparing it to the app server's clock left a
 * fresh row "not yet due" whenever that clock ran a few milliseconds behind,
 * and the immediate send silently became a five-minute wait for the cron.
 */
const dueNow = sql`(
  ${notificationDeliveries.status} = 'pending'
  OR (
    ${notificationDeliveries.status} = 'processing'
    AND ${notificationDeliveries.leaseExpiresAt} IS NOT NULL
    AND ${notificationDeliveries.leaseExpiresAt} < now()
  )
) AND ${notificationDeliveries.nextAttemptAt} <= now()`;

/**
 * What the transactional drains take: a comunicado's backlog in the bulk lane
 * must never sit ahead of a gift email in their oldest-first queue.
 */
const transactionalLane = eq(notificationDeliveries.lane, "transactional");

async function claimDelivery(deliveryId: number, owner: string) {
  const [claimed] = await db
    .update(notificationDeliveries)
    .set({
      status: "processing",
      leaseOwner: owner,
      leaseExpiresAt: sql`now() + make_interval(secs => ${LEASE_DURATION_MS / 1000})`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(notificationDeliveries.id, deliveryId),
        dueNow,
        // A bulk email is sent only in its batch, under the batch's key and
        // the lane's pacing: no id handed to this worker can send one alone.
        // A bulk push is claimed here like any other.
        sql`NOT (${notificationDeliveries.lane} = 'bulk' AND ${notificationDeliveries.channel} = 'email')`,
      ),
    )
    .returning();
  return claimed ?? null;
}

/** False when nothing was settled: the lease was lost, or `onlyIf` failed. */
async function settle(
  deliveryId: number,
  owner: string,
  values: PgUpdateSetSource<typeof notificationDeliveries>,
  onlyIf?: SQL,
) {
  const settled = await db
    .update(notificationDeliveries)
    .set({
      ...values,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notificationDeliveries.id, deliveryId),
        eq(notificationDeliveries.leaseOwner, owner),
        onlyIf,
      ),
    )
    .returning({ id: notificationDeliveries.id });
  return settled.length > 0;
}

async function giftWasRevoked(notificationId: number | null) {
  if (notificationId == null) return false;
  const [row] = await db
    .select({ revokedAt: notificationCampaignRecipients.revokedAt })
    .from(notificationCampaignRecipients)
    .where(eq(notificationCampaignRecipients.notificationId, notificationId))
    .limit(1);
  return row?.revokedAt != null;
}

/**
 * Sends one delivery if it is due and nobody else holds it.
 *
 * An address that bounced or reported us is skipped rather than sent: Resend
 * would accept the request and deliver nothing, and the admin would read
 * "enviado". A snapshot that no longer renders fails for good, since retrying
 * it can only fail the same way.
 *
 * A gift notice is checked against its gift right before sending, by email
 * or push: revoking cancels the queued ones, but one already claimed when the
 * revoke ran comes back here after a failed attempt or an expired lease, and
 * must not celebrate credits that were taken back.
 */
export async function attemptNotificationDelivery(
  deliveryId: number,
): Promise<DeliveryOutcome> {
  return (await attemptClaimedDelivery(deliveryId)).outcome;
}

async function attemptClaimedDelivery(deliveryId: number): Promise<{
  outcome: DeliveryOutcome;
  channel: "email" | "push" | null;
}> {
  const owner = `notification-delivery:${randomUUID()}`;
  const delivery = await claimDelivery(deliveryId, owner);
  if (!delivery) return { outcome: { processed: false }, channel: null };
  const channel = delivery.channel;
  const outcome = await runDelivery(delivery, owner);
  return { outcome, channel };
}

async function runDelivery(
  delivery: typeof notificationDeliveries.$inferSelect,
  owner: string,
): Promise<DeliveryOutcome> {
  const now = new Date();
  try {
    if (
      delivery.templateKey === "credit_gift_received" &&
      (await giftWasRevoked(delivery.notificationId))
    ) {
      await settle(delivery.id, owner, {
        status: "skipped",
        lastError: "revoked",
      });
      return { processed: true, status: "skipped" };
    }

    if (delivery.channel === "push") {
      return await settlePush(
        delivery,
        owner,
        await attemptPushDelivery(delivery),
      );
    }

    if (!delivery.recipientEmail) {
      await settle(delivery.id, owner, {
        status: "failed",
        attempts: delivery.attempts + 1,
        lastError: "no_recipient",
      });
      return { processed: true, status: "failed" };
    }

    if (await isSuppressed(delivery.recipientEmail)) {
      await settle(delivery.id, owner, {
        status: "skipped",
        lastError: "suppressed",
      });
      return { processed: true, status: "skipped" };
    }

    const copy = buildEmailCopy(delivery.templateKey, delivery.payload);
    if (!copy) {
      await settle(delivery.id, owner, {
        status: "failed",
        attempts: delivery.attempts + 1,
        lastError: "render_unavailable",
      });
      return { processed: true, status: "failed" };
    }

    const result = await sendEmail(
      {
        to: [delivery.recipientEmail],
        from: copy.from,
        subject: copy.subject,
        react: copy.react,
      },
      // One key per delivery: a retry after a timeout whose request did land
      // is deduplicated by Resend instead of arriving twice.
      { idempotencyKey: `notification-delivery-${delivery.id}` },
    );
    assertSent(result);

    await settle(delivery.id, owner, {
      status: "sent",
      sentAt: now,
      lastError: null,
      providerMessageId: result.data?.id ?? null,
    });
    return { processed: true, status: "sent" };
  } catch (error) {
    // Resend asking us to slow down is not this email failing: no attempt is
    // spent, and the row waits what Retry-After asks (2 s at least, a day at
    // most) on the database clock `dueNow` reads. Only while the row is under
    // 20 hours old, so its key still reaches Resend inside the 24 hours
    // Resend remembers it; an older row spends an attempt as before.
    if (
      error instanceof EmailSendError &&
      error.code === "rate_limit_exceeded" &&
      (await settle(
        delivery.id,
        owner,
        {
          status: "pending",
          lastError: "resend:rate_limit_exceeded",
          nextAttemptAt: sql`now() + make_interval(secs => least(
            ${MAX_BACKOFF_MS / 1000},
            greatest(2, ceil(${error.retryAfterMs}::double precision / 1000))
          ))`,
        },
        sql`${notificationDeliveries.createdAt} > now() - interval '20 hours'`,
      ))
    ) {
      return { processed: true, status: "retry" };
    }
    const attempts = delivery.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    await settle(delivery.id, owner, {
      status: failed ? "failed" : "pending",
      attempts,
      // The type only: a provider message can echo the recipient.
      lastError: sendFailureType(error).slice(0, 180),
      nextAttemptAt: computeNextAttemptAt(attempts, now),
    });
    return { processed: true, status: failed ? "failed" : "retry" };
  }
}

/** How long a push handed back untried waits before another server tries. */
const PUSH_RELEASE_DELAY_MS = 60 * 60 * 1000;

/**
 * Settles a push attempt; the same retries and records as an email. Timed
 * from the answer, not the claim: a send can take its whole socket timeout,
 * and Retry-After counts from the response.
 */
async function settlePush(
  delivery: typeof notificationDeliveries.$inferSelect,
  owner: string,
  result: PushDeliveryResult,
): Promise<DeliveryOutcome> {
  const now = new Date();
  switch (result.kind) {
    case "release":
      await settle(delivery.id, owner, {
        status: "pending",
        lastError: result.reason,
        nextAttemptAt: new Date(now.getTime() + PUSH_RELEASE_DELAY_MS),
      });
      return { processed: true, status: "retry" };
    case "sent":
      await settle(delivery.id, owner, {
        status: "sent",
        sentAt: now,
        lastError: null,
        providerMessageId: result.providerMessageId,
      });
      return { processed: true, status: "sent" };
    case "skip":
    case "gone":
      await settle(delivery.id, owner, {
        status: "skipped",
        lastError: result.kind === "skip" ? result.reason : result.error,
      });
      return { processed: true, status: "skipped" };
    case "failed":
      await settle(delivery.id, owner, {
        status: "failed",
        attempts: delivery.attempts + 1,
        lastError: result.error,
      });
      return { processed: true, status: "failed" };
    case "retry": {
      // A service asking us to slow down is not this push failing: a gift to
      // a hundred people could otherwise spend every row's attempts on one
      // throttle. The push's expiry bounds those waits instead.
      const throttled = result.retryAfterMs != null;
      const attempts = throttled ? delivery.attempts : delivery.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      await settle(delivery.id, owner, {
        status: failed ? "failed" : "pending",
        attempts,
        lastError: result.error,
        nextAttemptAt: computeNextAttemptAt(
          Math.max(1, attempts),
          now,
          result.retryAfterMs,
        ),
      });
      return { processed: true, status: failed ? "failed" : "retry" };
    }
  }
}

export async function sendNotificationDeliveries(
  deliveryIds: readonly number[],
  budgetMs: number,
): Promise<{ sent: number; skipped: number; failed: number; retry: number }> {
  const startedAt = Date.now();
  const counts = { sent: 0, skipped: 0, failed: 0, retry: 0 };
  let emailedBefore = false;
  for (const id of deliveryIds) {
    // A budget of 0 (the cron's run already used up) sends nothing.
    if (Date.now() - startedAt >= budgetMs) break;
    // The gap goes before the next request after an email, which is when
    // Resend's per-second limit could bite; a push in between costs nothing.
    if (emailedBefore) await wait(SEND_SPACING_MS);
    const { outcome, channel } = await attemptClaimedDelivery(id);
    emailedBefore = outcome.processed && channel === "email";
    if (outcome.processed) counts[outcome.status] += 1;
  }
  return counts;
}

/**
 * Sends freshly created deliveries once the response is out. Sequential and
 * spaced, for Resend's rate limit; whatever does not fit in the budget is left
 * pending for the cron.
 */
export function scheduleNotificationDeliveries(deliveryIds: readonly number[]) {
  const unique = [
    ...new Set(deliveryIds.filter((id) => Number.isInteger(id) && id > 0)),
  ];
  if (unique.length === 0) return;
  after(async () => {
    try {
      await sendNotificationDeliveries(unique, DEFAULT_DRAIN_BUDGET_MS);
    } catch (error) {
      console.error("Notification delivery drain failed", {
        errorType: sendFailureType(error),
      });
    }
  });
}

/**
 * Transactional pushes due now, oldest first. Run right after a commit that
 * may have queued some, by callers that never see the delivery ids (the
 * reservation and disciplinary mirrors write them inside a savepoint), and by
 * the cron.
 *
 * Safe to run alongside another drain: each row is claimed before it is sent.
 */
export async function sendDuePushDeliveries({
  limit = 25,
  budgetMs = 15_000,
  fresh = false,
}: {
  limit?: number;
  budgetMs?: number;
  /**
   * Only rows never tried and written in the last few minutes, newest first:
   * right after a commit, the rows it just wrote must not wait behind retries
   * to a slow push service. Retries are the cron's, oldest first.
   */
  fresh?: boolean;
} = {}) {
  // Without keys nothing can be sent; leave the rows for a server that can.
  if (!pushVapidConfig()) {
    return { scanned: 0, sent: 0, skipped: 0, failed: 0, retry: 0 };
  }
  const rows = await db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(
      and(
        transactionalLane,
        eq(notificationDeliveries.channel, "push"),
        dueNow,
        fresh
          ? and(
              eq(notificationDeliveries.attempts, 0),
              sql`${notificationDeliveries.createdAt} > now() - interval '10 minutes'`,
            )
          : undefined,
      ),
    )
    .orderBy(
      ...(fresh
        ? [desc(notificationDeliveries.id)]
        : [notificationDeliveries.createdAt, notificationDeliveries.id]),
    )
    .limit(limit);

  const ids = rows.map((row) => row.id);
  const counts = await sendNotificationDeliveries(ids, budgetMs);
  return { scanned: ids.length, ...counts };
}

/**
 * The pushes a commit just queued, once the response is out; never throws.
 * For callers that do not get the delivery ids back.
 */
export async function drainDuePushDeliveries() {
  try {
    await sendDuePushDeliveries({ fresh: true });
  } catch (error) {
    console.error("Push delivery drain failed", {
      errorType: sendFailureType(error),
    });
  }
}

/**
 * A bulk send's pushes, oldest first, several in flight at once: a comunicado
 * to 500 devices one at a time would take minutes, and pushes go to many push
 * services rather than one rate limit. Each row is claimed, sent and settled
 * as the worker does any push, so every rule of that path holds.
 *
 * `scope` is ANDed into the selection. The inbox item is joined as
 * `notifications`, under its own name, so a scope is written with the
 * schema's `notifications` columns; a row whose item is gone matches neither
 * a scope nor a campaign.
 *
 * Once `budgetMs` (counted from the call) is spent, nothing new starts.
 */
export async function sendBulkPushes({
  campaignId,
  scope,
  budgetMs,
  concurrency = BULK_PUSH_CONCURRENCY,
  limit = 400,
}: {
  campaignId?: number;
  scope?: SQL;
  budgetMs: number;
  concurrency?: number;
  limit?: number;
}) {
  const startedAt = Date.now();
  const counts = { sent: 0, skipped: 0, failed: 0, retry: 0 };
  // As in `sendDuePushDeliveries`: claiming rows here would only hand them
  // back as `unconfigured` for an hour.
  if (!pushVapidConfig()) return { scanned: 0, ...counts };
  const rows = await db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .leftJoin(
      notifications,
      eq(notifications.id, notificationDeliveries.notificationId),
    )
    .where(
      and(
        eq(notificationDeliveries.lane, "bulk"),
        eq(notificationDeliveries.channel, "push"),
        dueNow,
        campaignId === undefined
          ? undefined
          : eq(notifications.campaignId, campaignId),
        scope,
      ),
    )
    .orderBy(notificationDeliveries.id)
    .limit(limit);
  const ids = rows.map((row) => row.id);

  // Each worker takes the next id until the list or the budget runs out. A
  // throw stops new starts and is rethrown once the others have settled, so
  // no push is still out when this returns.
  let next = 0;
  const errors: unknown[] = [];
  async function work() {
    while (
      errors.length === 0 &&
      next < ids.length &&
      Date.now() - startedAt < budgetMs
    ) {
      const id = ids[next++]!;
      try {
        const { outcome } = await attemptClaimedDelivery(id);
        if (outcome.processed) counts[outcome.status] += 1;
      } catch (error) {
        errors.push(error);
      }
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), ids.length) },
      work,
    ),
  );
  if (errors.length > 0) throw errors[0];
  return { scanned: ids.length, ...counts };
}

/**
 * The cron's email half: every transactional email due, oldest first, within
 * a time budget. Pushes have their own pass, `sendDuePushDeliveries`.
 */
export async function processPendingNotificationDeliveries({
  limit = 80,
  budgetMs = DEFAULT_DRAIN_BUDGET_MS,
}: { limit?: number; budgetMs?: number } = {}) {
  const rows = await db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(
      and(
        transactionalLane,
        eq(notificationDeliveries.channel, "email"),
        dueNow,
      ),
    )
    .orderBy(notificationDeliveries.createdAt, notificationDeliveries.id)
    .limit(limit);

  const ids = rows.map((row) => row.id);
  const counts = await sendNotificationDeliveries(ids, budgetMs);
  return { scanned: ids.length, ...counts };
}
