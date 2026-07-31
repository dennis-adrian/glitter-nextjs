import "server-only";

import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";

import { utcTimestamp } from "@/app/lib/sql-time";
import { db } from "@/db";
import {
  sessionPurchaseEvents,
  sessionPurchases,
  sessionWaitlistEntries,
  sessionWaitlistInvitations,
} from "@/db/schema";

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

export type ExpiredInvitationSweepResult = {
  expired: number;
  invitationIds: number[];
};

/**
 * Flips lapsed waitlist invitations to `expired`.
 *
 * Like the hold sweep, this changes nothing about who may buy:
 * `resolveInvitationUse` already refuses an invitation past its deadline
 * whatever the row says. What the sweep adds is a truthful status, so the
 * partial unique index frees up and an admin can invite the same person again
 * without the row still claiming to be live.
 *
 * The entry goes back to `waiting` rather than staying `invited`: they never
 * took the seat, and leaving them `invited` would misreport the list.
 * `converted` and `removed` entries are left alone — both are terminal.
 */
export async function expireWaitlistInvitations(
  now = new Date(),
): Promise<ExpiredInvitationSweepResult> {
  const invitationIds = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(sessionWaitlistInvitations)
      .set({ status: "expired", updatedAt: now })
      .where(
        and(
          eq(sessionWaitlistInvitations.status, "sent"),
          lte(sessionWaitlistInvitations.expiresAt, utcTimestamp(now)),
        ),
      )
      .returning({
        id: sessionWaitlistInvitations.id,
        entryId: sessionWaitlistInvitations.waitlistEntryId,
      });

    if (claimed.length === 0) return [];

    await tx
      .update(sessionWaitlistEntries)
      .set({ status: "waiting", updatedAt: now })
      .where(
        and(
          inArray(
            sessionWaitlistEntries.id,
            claimed.map((row) => row.entryId),
          ),
          eq(sessionWaitlistEntries.status, "invited"),
        ),
      );

    return claimed.map((row) => row.id);
  });

  return { expired: invitationIds.length, invitationIds };
}
