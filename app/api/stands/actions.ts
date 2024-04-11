"use server";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { UserCategory } from "@/app/api/users/definitions";
import { FestivalWithUserRequests } from "@/app/data/festivals/definitions";
import { db, pool } from "@/db";
import {
  reservationParticipants,
  standReservations,
  stands,
  users,
} from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";

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

export async function fetchStandsByFestivalId(
  festivalId: number,
  category: UserCategory = "illustration",
): Promise<StandWithReservationsWithParticipants[]> {
  const client = await pool.connect();

  try {
    const standsRes = await db.query.stands.findMany({
      where: and(
        eq(stands.festivalId, festivalId),
        eq(stands.standCategory, category),
      ),
      orderBy: asc(stands.standNumber),
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
    });

    return standsRes;
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
