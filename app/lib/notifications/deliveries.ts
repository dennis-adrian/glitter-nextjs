import "server-only";

import { randomUUID } from "crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { after } from "next/server";

import { isSuppressed } from "@/app/lib/emails/suppressions";
import { pushVapidConfig } from "@/app/lib/notifications/push/config";
import {
  attemptPushDelivery,
  type PushDeliveryResult,
} from "@/app/lib/notifications/push/send";
import { buildEmailCopy } from "@/app/lib/notifications/registry";
import { sendEmail } from "@/app/vendors/resend";
import { assertSent, sendFailureType } from "@/app/vendors/resend-result";
import { db } from "@/db";
import {
  notificationCampaignRecipients,
  notificationDeliveries,
  pendingUserDeletions,
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

async function claimDelivery(deliveryId: number, owner: string) {
  const [claimed] = await db
    .update(notificationDeliveries)
    .set({
      status: "processing",
      leaseOwner: owner,
      leaseExpiresAt: sql`now() + make_interval(secs => ${LEASE_DURATION_MS / 1000})`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(notificationDeliveries.id, deliveryId), dueNow))
    .returning();
  return claimed ?? null;
}

async function settle(
  deliveryId: number,
  owner: string,
  values: Partial<typeof notificationDeliveries.$inferInsert>,
) {
  await db
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
      ),
    );
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

/** Same test as a push's: a deletion still waiting on the local delete. */
async function userIsBeingDeleted(userId: number | null) {
  if (userId == null) return false;
  const [row] = await db
    .select({ id: pendingUserDeletions.id })
    .from(pendingUserDeletions)
    .where(
      and(
        eq(pendingUserDeletions.userId, userId),
        isNull(pendingUserDeletions.localDeletedAt),
      ),
    )
    .limit(1);
  return row != null;
}

/**
 * Sends one delivery if it is due and nobody else holds it.
 *
 * An address that bounced or reported us is skipped rather than sent: Resend
 * would accept the request and deliver nothing, and the admin would read
 * "enviado". So is a person whose account is being deleted, as their pushes
 * are. A snapshot that no longer renders fails for good, since retrying it can
 * only fail the same way.
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

    if (await userIsBeingDeleted(delivery.userId)) {
      await settle(delivery.id, owner, {
        status: "skipped",
        lastError: "deleting",
      });
      return { processed: true, status: "skipped" };
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
 * Pushes due now, oldest first. Run right after a commit that may have queued
 * some, by callers that never see the delivery ids (the reservation and
 * disciplinary mirrors write them inside a savepoint), and by the cron.
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
 * The cron's email half: every email due, oldest first, within a time budget.
 * Pushes have their own pass, `sendDuePushDeliveries`.
 */
export async function processPendingNotificationDeliveries({
  limit = 80,
  budgetMs = DEFAULT_DRAIN_BUDGET_MS,
}: { limit?: number; budgetMs?: number } = {}) {
  const rows = await db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(and(eq(notificationDeliveries.channel, "email"), dueNow))
    .orderBy(notificationDeliveries.createdAt, notificationDeliveries.id)
    .limit(limit);

  const ids = rows.map((row) => row.id);
  const counts = await sendNotificationDeliveries(ids, budgetMs);
  return { scanned: ids.length, ...counts };
}
