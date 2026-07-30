import "server-only";

import { and, eq, isNotNull, lte } from "drizzle-orm";

import { utcTimestamp } from "@/app/lib/sql-time";
import { db } from "@/db";
import { sessionPurchaseEvents, sessionPurchases } from "@/db/schema";

export type ExpiredHoldSweepResult = {
  expired: number;
  purchaseIds: number[];
};

/**
 * Flips abandoned bank-QR holds to `expired`.
 *
 * This does **not** free seats — `isHoldingSeat` already stops counting a
 * `pending_upload` the instant its deadline passes, so inventory is correct
 * whether or not this ever runs. What the sweep adds is bookkeeping: a
 * terminal status, an `expiredAt`, and an audit row, so an abandoned purchase
 * stops appearing live in admin views and reporting.
 *
 * Only `pending_upload` is swept. Once a voucher exists the purchase is
 * `under_verification` and the seat is held by the review, not the clock —
 * expiring it would silently discard a payment the team has not looked at.
 *
 * The UPDATE is the claim: overlapping runs cannot both process a row, because
 * only one of them gets it back from `RETURNING`. That is what makes the audit
 * insert below safe to do outside any extra locking.
 */
export async function expireAbandonedHolds(
  now = new Date(),
): Promise<ExpiredHoldSweepResult> {
  const claimed = await db
    .update(sessionPurchases)
    .set({ status: "expired", expiredAt: now, updatedAt: now })
    .where(
      and(
        eq(sessionPurchases.status, "pending_upload"),
        eq(sessionPurchases.paymentMode, "bank_qr"),
        isNotNull(sessionPurchases.holdExpiresAt),
        // `utcTimestamp` because a bare Date parameter serializes in the
        // server's local zone while Postgres reads `timestamp` as zoneless —
        // the same skew that once miscounted holds.
        lte(sessionPurchases.holdExpiresAt, utcTimestamp(now)),
      ),
    )
    .returning({ id: sessionPurchases.id });

  if (claimed.length === 0) return { expired: 0, purchaseIds: [] };

  const purchaseIds = claimed.map((row) => row.id);

  await db.insert(sessionPurchaseEvents).values(
    purchaseIds.map((purchaseId) => ({
      purchaseId,
      actorType: "system" as const,
      eventType: "expired" as const,
      fromStatus: "pending_upload" as const,
      toStatus: "expired" as const,
      changes: { sweptAt: now.toISOString() },
    })),
  );

  return { expired: purchaseIds.length, purchaseIds };
}
