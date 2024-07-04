"use server";

import { ReservationBase } from "@/app/api/reservations/definitions";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { UserCategory } from "@/app/api/users/definitions";
import {
  FestivalWithDates,
  FestivalWithUserRequests,
} from "@/app/data/festivals/definitions";
import { db, pool } from "@/db";
import {
  festivalSectors,
  reservationParticipants,
  standReservations,
  stands,
  users,
} from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";

export type Participant = typeof reservationParticipants.$inferSelect & {
  user: typeof users.$inferSelect;
};
type StandReservation = typeof standReservations.$inferSelect & {
  participants: Participant[];
};
export type Stand = typeof stands.$inferSelect & {
  reservations: StandReservation[];
  festival: FestivalWithUserRequests;
};

export type StandReservationWithFestival = ReservationBase & {
  festival: FestivalWithDates;
};

export async function fetchStandsByFestivalId(
  festivalId: number,
  category: UserCategory = "illustration",
): Promise<StandWithReservationsWithParticipants[]> {
  const client = await pool.connect();

  try {
    return await db.transaction(async (tx) => {
      const standIds = await tx
        .select({ id: stands.id })
        .from(stands)
        .leftJoin(
          festivalSectors,
          eq(stands.festivalSectorId, festivalSectors.id),
        )
        .where(
          and(
            eq(festivalSectors.festivalId, festivalId),
            eq(stands.standCategory, category),
          ),
        );

      return await tx.query.stands.findMany({
        where: inArray(
          stands.id,
          standIds.map((stand) => stand.id),
        ),
        with: {
          reservations: {
            with: {
              participants: {
                with: {
                  user: true,
                },
              },
            },
          },
        },
        orderBy: asc(stands.standNumber),
      });
    });
  } catch (error) {
    console.error("Error fetching stands", error);
    return [];
  } finally {
    client.release();
  }
}

export type StandBase = typeof stands.$inferSelect;
export async function fetchStandById(
  id: number,
): Promise<StandBase | undefined | null> {
  const client = await pool.connect();

  try {
    return await db.query.stands.findFirst({
      where: eq(stands.id, id),
    });
  } catch (error) {
    console.error("Error fetching stand", error);
    return null;
  } finally {
    client.release();
  }
}
