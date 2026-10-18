import "server-only";

import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { after } from "next/server";

import { isSuppressed } from "@/app/lib/emails/suppressions";
import { buildEmailCopy } from "@/app/lib/notifications/registry";
import { sendEmail } from "@/app/vendors/resend";
import { assertSent, sendFailureType } from "@/app/vendors/resend-result";
import { db } from "@/db";
import { notificationDeliveries } from "@/db/schema";

const MAX_ATTEMPTS = 5;
const LEASE_DURATION_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;
/**
 * Gap between sends while draining. Resend limits requests per second per
 * team, and a gift to 100 people would otherwise fire 100 at once and spend
 * its retries on `rate_limit_exceeded`.
 */
const SEND_SPACING_MS = 600;
/** What a drain may spend sending, inside the 100-second function limit. */
const DEFAULT_DRAIN_BUDGET_MS = 60_000;

export type DeliveryOutcome =
  | { processed: false }
  | { processed: true; status: "sent" | "skipped" | "retry" | "failed" };

function computeNextAttemptAt(attempts: number, now: Date) {
  const delay = Math.min(
    MAX_BACKOFF_MS,
    30_000 * 2 ** Math.max(0, attempts - 1),
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

/**
 * Sends one delivery if it is due and nobody else holds it.
 *
 * An address that bounced or reported us is skipped rather than sent: Resend
 * would accept the request and deliver nothing, and the admin would read
 * "enviado". A snapshot that no longer renders fails for good, since retrying
 * it can only fail the same way.
 */
export async function attemptNotificationDelivery(
  deliveryId: number,
): Promise<DeliveryOutcome> {
  const owner = `notification-delivery:${randomUUID()}`;
  const delivery = await claimDelivery(deliveryId, owner);
  if (!delivery) return { processed: false };

  const now = new Date();
  try {
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

export async function sendNotificationDeliveries(
  deliveryIds: readonly number[],
  budgetMs: number,
): Promise<{ sent: number; skipped: number; failed: number; retry: number }> {
  const startedAt = Date.now();
  const counts = { sent: 0, skipped: 0, failed: 0, retry: 0 };
  let sentBefore = false;
  for (const id of deliveryIds) {
    if (Date.now() - startedAt > budgetMs) break;
    if (sentBefore) await wait(SEND_SPACING_MS);
    const outcome = await attemptNotificationDelivery(id);
    sentBefore = outcome.processed;
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

/** The cron's half: everything due, oldest first, within a time budget. */
export async function processPendingNotificationDeliveries({
  limit = 80,
  budgetMs = DEFAULT_DRAIN_BUDGET_MS,
}: { limit?: number; budgetMs?: number } = {}) {
  const rows = await db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(dueNow)
    .orderBy(notificationDeliveries.createdAt, notificationDeliveries.id)
    .limit(limit);

  const ids = rows.map((row) => row.id);
  const counts = await sendNotificationDeliveries(ids, budgetMs);
  return { scanned: ids.length, ...counts };
}
