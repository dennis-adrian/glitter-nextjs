import "server-only";

import { and, eq, gt, inArray, isNull } from "drizzle-orm";

import { OCCUPYING_RESERVATION_STATUSES } from "@/app/lib/reservations/members";
import { db } from "@/db";
import {
  standHoldMembers,
  standHolds,
  standReservationStands,
  stands,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Whether anything currently occupies a stand.
 *
 * Both halves resolve through aggregate membership rather than the parents'
 * legacy `stand_id` columns, so a full table occupies both of its stands.
 */
export async function standHasLiveOccupancy(
  tx: DbTx,
  standId: number,
  now = new Date(),
) {
  const [liveHold] = await tx
    .select({ id: standHoldMembers.id })
    .from(standHoldMembers)
    .innerJoin(standHolds, eq(standHolds.id, standHoldMembers.holdId))
    .where(
      and(eq(standHoldMembers.standId, standId), gt(standHolds.expiresAt, now)),
    )
    .limit(1);
  if (liveHold) return true;

  const [liveReservation] = await tx
    .select({ id: standReservationStands.id })
    .from(standReservationStands)
    .where(
      and(
        eq(standReservationStands.standId, standId),
        isNull(standReservationStands.releasedAt),
        inArray(standReservationStands.reservationStatus, [
          ...OCCUPYING_RESERVATION_STATUSES,
        ]),
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
