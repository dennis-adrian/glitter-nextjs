import "server-only";

import { and, eq, isNotNull, lte } from "drizzle-orm";

import { utcTimestamp } from "@/app/lib/sql-time";
import { db } from "@/db";
import { fastPassEvents, fastPassPurchases } from "@/db/schema";

export type ExpiredHoldSweepResult = {
  expired: number;
  purchaseIds: number[];
};

export type ExpiredCorrectionSweepResult = {
  expired: number;
  purchaseIds: number[];
};

const CORRECTION_EXPIRED_REASON =
  "El plazo para corregir el comprobante expiró (sistema)";

/**
 * Bookkeeping sweep for abandoned online holds. Availability already ignores
 * overdue `pending_upload` rows via lazy expiry; this adds terminal status and
 * audit rows.
 */
export async function expireAbandonedHolds(
  now = new Date(),
): Promise<ExpiredHoldSweepResult> {
  const purchaseIds = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(fastPassPurchases)
      .set({ status: "expired", expiredAt: now, updatedAt: now })
      .where(
        and(
          eq(fastPassPurchases.channel, "online"),
          eq(fastPassPurchases.status, "pending_upload"),
          eq(fastPassPurchases.paymentMethod, "bank_qr"),
          isNotNull(fastPassPurchases.holdExpiresAt),
          lte(fastPassPurchases.holdExpiresAt, utcTimestamp(now)),
        ),
      )
      .returning({ id: fastPassPurchases.id });

    if (claimed.length === 0) return [];

    const ids = claimed.map((row) => row.id);

    await tx.insert(fastPassEvents).values(
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

/**
 * Expires purchases whose correction window lapsed without a new voucher.
 * Capacity frees immediately via lazy expiry on `changes_requested`.
 */
export async function expireStaleCorrections(
  now = new Date(),
): Promise<ExpiredCorrectionSweepResult> {
  const purchaseIds = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(fastPassPurchases)
      .set({
        status: "expired",
        expiredAt: now,
        correctionExpiresAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(fastPassPurchases.channel, "online"),
          eq(fastPassPurchases.status, "changes_requested"),
          isNotNull(fastPassPurchases.correctionExpiresAt),
          lte(fastPassPurchases.correctionExpiresAt, utcTimestamp(now)),
        ),
      )
      .returning({ id: fastPassPurchases.id });

    if (claimed.length === 0) return [];

    const ids = claimed.map((row) => row.id);

    await tx.insert(fastPassEvents).values(
      ids.map((purchaseId) => ({
        purchaseId,
        actorType: "system" as const,
        eventType: "expired" as const,
        fromStatus: "changes_requested" as const,
        toStatus: "expired" as const,
        reason: CORRECTION_EXPIRED_REASON,
        changes: { sweptAt: now.toISOString() },
      })),
    );

    return ids;
  });

  return { expired: purchaseIds.length, purchaseIds };
}
