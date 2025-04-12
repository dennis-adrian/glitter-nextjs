"use server";

import { ReservationCollaborationWithRelations } from "@/app/lib/collaborators/definitions";
import { db } from "@/db";
import { reservationCollaborators, standReservations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { revalidatePath } from "next/cache";

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

export async function registerArrival(reservationCollaborationId: number) {
  try {
    await db
      .update(reservationCollaborators)
      .set({
        arrivedAt: DateTime.now().toJSDate(),
        updatedAt: DateTime.now().toJSDate(),
      })
      .where(eq(reservationCollaborators.id, reservationCollaborationId));
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Error al registrar la llegada",
    };
  }

  revalidatePath("/dashboard/festivals/");
  return {
    success: true,
    message: "Llegada registrada correctamente",
  };
}

export async function removeArrival(reservationCollaborationId: number) {
  try {
    await db
      .update(reservationCollaborators)
      .set({
        arrivedAt: null,
        updatedAt: DateTime.now().toJSDate(),
      })
      .where(eq(reservationCollaborators.id, reservationCollaborationId));
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Error al eliminar la llegada",
    };
  }

  revalidatePath("/dashboard/festivals/");
  return {
    success: true,
    message: "Llegada eliminada correctamente",
  };
}
