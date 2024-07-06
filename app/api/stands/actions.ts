"use server";

import { ReservationBase } from "@/app/api/reservations/definitions";
import {
  FestivalWithDates,
  FestivalWithUserRequests,
} from "@/app/data/festivals/definitions";
import { db, pool } from "@/db";
import {
  reservationParticipants,
  standReservations,
  stands,
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

export type StandReservationWithFestival = ReservationBase & {
  festival: FestivalWithDates;
};

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
