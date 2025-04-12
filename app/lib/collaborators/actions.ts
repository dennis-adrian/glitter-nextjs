"use server";

import { ReservationCollaborationWithRelations } from "@/app/lib/collaborators/definitions";
import { db } from "@/db";
import { standReservations } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function fetchReservationCollaborationsByFestivalId(
  festivalId: number,
): Promise<ReservationCollaborationWithRelations[]> {
  try {
    // First get the reservation IDs for the given festival
    const reservations = await db.query.standReservations.findMany({
      where: eq(standReservations.festivalId, festivalId),
      columns: {
        id: true,
      },
    });

    const reservationIds = reservations.map((r) => r.id);

    // Then get the collaborators for those reservations
    return await db.query.reservationCollaborators.findMany({
      where: (reservationCollaborators, { inArray }) =>
        inArray(reservationCollaborators.reservationId, reservationIds),
      with: {
        reservation: {
          with: {
            stand: true,
          },
        },
        collaborator: true,
      },
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}
