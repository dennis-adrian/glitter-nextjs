"use server";

import { ReservationParticipant } from "@/app/lib/participations/definitions";
import { requireProfileOwnerOrStaff } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  festivals,
  reservationParticipants,
  standReservations,
  users,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function fetchParticipationInFestival(
  userId: number,
  festivalId: number,
): Promise<ReservationParticipant | null> {
  const actor = await requireProfileOwnerOrStaff(userId);
  if (!actor) return null;

  try {
    const [participation] = await db
      .select({
        id: reservationParticipants.id,
        userId: reservationParticipants.userId,
        reservationId: reservationParticipants.reservationId,
        hasStamp: reservationParticipants.hasStamp,
        updatedAt: reservationParticipants.updatedAt,
        createdAt: reservationParticipants.createdAt,
      })
      .from(reservationParticipants)
      .leftJoin(
        standReservations,
        eq(reservationParticipants.reservationId, standReservations.id),
      )
      .leftJoin(users, eq(reservationParticipants.userId, users.id))
      .leftJoin(festivals, eq(standReservations.festivalId, festivals.id))
      .where(
        and(eq(standReservations.festivalId, festivalId), eq(users.id, userId)),
      );

    if (!participation) {
      return null;
    }

    return participation;
  } catch (error) {
    console.error("Error fetching participation in festival", error);
    return null;
  }
}
