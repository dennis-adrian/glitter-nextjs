import "server-only";

import { and, eq, gt, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { standHolds, standReservations, stands } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function standHasLiveOccupancy(
  tx: DbTx,
  standId: number,
  now = new Date(),
) {
  const [liveHold] = await tx
    .select({ id: standHolds.id })
    .from(standHolds)
    .where(and(eq(standHolds.standId, standId), gt(standHolds.expiresAt, now)))
    .limit(1);
  if (liveHold) return true;

  const [liveReservation] = await tx
    .select({ id: standReservations.id })
    .from(standReservations)
    .where(
      and(
        eq(standReservations.standId, standId),
        sql`${standReservations.status} IN ('pending', 'verification_payment', 'accepted')`,
      ),
    )
    .limit(1);
  return liveReservation != null;
}

export async function releaseStandIfVacant(
  tx: DbTx,
  standId: number,
  now = new Date(),
) {
  if (await standHasLiveOccupancy(tx, standId, now)) return false;
  const updated = await tx
    .update(stands)
    .set({ status: "available", updatedAt: now })
    .where(
      and(
        eq(stands.id, standId),
        inArray(stands.status, ["held", "reserved", "confirmed"]),
      ),
    )
    .returning({ id: stands.id });
  return updated.length > 0;
}
