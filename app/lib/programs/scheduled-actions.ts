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
 * only one of them gets it back from `RETURNING`. It shares a transaction with
 * the audit insert so a purchase can never end up `expired` with no record of
 * why — either both land or neither does.
 */
export async function expireAbandonedHolds(
  now = new Date(),
): Promise<ExpiredHoldSweepResult> {
  const purchaseIds = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(sessionPurchases)
      .set({ status: "expired", expiredAt: now, updatedAt: now })
      .where(
        and(
          eq(sessionPurchases.status, "pending_upload"),
          eq(sessionPurchases.paymentMode, "bank_qr"),
          isNotNull(sessionPurchases.holdExpiresAt),
          // Explicit UTC. Drizzle's own column mapping already encodes a bare
          // `Date` correctly here, but the wrapper keeps the intent legible
          // next to the raw-SQL availability predicates, where a bare `Date`
          // *is* silently local-zone and once miscounted holds.
          lte(sessionPurchases.holdExpiresAt, utcTimestamp(now)),
        ),
      )
      .returning({ id: sessionPurchases.id });

    if (claimed.length === 0) return [];

    const ids = claimed.map((row) => row.id);

    await tx.insert(sessionPurchaseEvents).values(
      ids.map((purchaseId) => ({
        purchaseId,
        actorType: "system" as const,
        eventType: "expired" as const,
        fromStatus: "pending_upload" as const,
        toStatus: "expired" as const,
        changes: { sweptAt: now.toISOString() },
      })),
    );

    return ids;
  });

  return { expired: purchaseIds.length, purchaseIds };
}
