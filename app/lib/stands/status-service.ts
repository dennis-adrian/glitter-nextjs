import "server-only";

import { and, eq, gt, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  festivalSectors,
  standHolds,
  stands,
  userRequests,
} from "@/db/schema";
import type { StandStatus } from "@/app/lib/reservations/dto";

export async function getFestivalSectorForStatus(sectorId: number) {
  return db.query.festivalSectors.findFirst({
    where: eq(festivalSectors.id, sectorId),
    columns: { id: true, festivalId: true },
  });
}

export async function hasAcceptedFestivalEnrollment(
  userId: number,
  festivalId: number,
) {
  const [row] = await db
    .select({ id: userRequests.id })
    .from(userRequests)
    .where(
      and(
        eq(userRequests.userId, userId),
        eq(userRequests.festivalId, festivalId),
        eq(userRequests.type, "festival_participation"),
        eq(userRequests.status, "accepted"),
      ),
    )
    .limit(1);
  return row != null;
}

export async function loadSectorStandStatusRows(sectorId: number, now: Date) {
  const sectorStands = await db
    .select({
      standId: stands.id,
      storedStatus: stands.status,
      updatedAt: stands.updatedAt,
    })
    .from(stands)
    .where(eq(stands.festivalSectorId, sectorId));

  const standIds = sectorStands.map((stand) => stand.standId);
  const activeHoldRows =
    standIds.length === 0
      ? []
      : await db
          .select({ standId: standHolds.standId })
          .from(standHolds)
          .where(
            and(
              inArray(standHolds.standId, standIds),
              gt(standHolds.expiresAt, now),
            ),
          );

  return {
    stands: sectorStands.map((stand) => ({
      standId: stand.standId,
      storedStatus: stand.storedStatus as StandStatus,
      updatedAt: stand.updatedAt,
    })),
    activeHoldStandIds: new Set(activeHoldRows.map((hold) => hold.standId)),
  };
}
