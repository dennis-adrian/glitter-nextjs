"use server";

import { FestivalWithUserRequests } from "@/app/api/festivals/definitions";
import { db, pool } from "@/db";
import {
  festivals,
  reservationParticipants,
  standReservations,
  stands,
  userRequests,
  users,
} from "@/db/schema";
import { eq } from "drizzle-orm";

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
): Promise<Stand[]> {
  const client = await pool.connect();

  try {
    const standsRes = await db.query.stands.findMany({
      where: eq(stands.festivalId, festivalId),
      with: {
        festival: {
          with: {
            userRequests: {
              with: {
                user: {
                  with: {
                    participations: {
                      with: {
                        reservation: true,
                      },
                    },
                    userRequests: true,
                  },
                },
              },
            },
          },
        },
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
