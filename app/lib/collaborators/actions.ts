"use server";

import { ReservationCollaborationWithRelations } from "@/app/lib/collaborators/definitions";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  collaboratorsAttendanceLogs,
  festivalDates,
  reservationCollaborators,
  standReservations,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { revalidatePath } from "next/cache";

export async function fetchReservationCollaborationsByFestivalId(
  festivalId: number,
): Promise<ReservationCollaborationWithRelations[]> {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) return [];

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
            // A full table holds two stands; `stand` alone names only the one
            // the participant picked first.
            members: { with: { stand: true } },
            festival: {
              with: {
                festivalDates: true,
              },
            },
          },
        },
        // The table renders only the name; the identification number stays
        // on the server.
        collaborator: {
          columns: { id: true, firstName: true, lastName: true },
        },
        collaboratorsAttendanceLogs: true,
      },
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function registerArrival(
  reservationCollaborationId: number,
  festivalDateId: number,
) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

  try {
    // The date must be one of the festival the collaborator's reservation is for.
    const [target] = await db
      .select({ id: reservationCollaborators.id })
      .from(reservationCollaborators)
      .innerJoin(
        standReservations,
        eq(standReservations.id, reservationCollaborators.reservationId),
      )
      .innerJoin(
        festivalDates,
        and(
          eq(festivalDates.festivalId, standReservations.festivalId),
          eq(festivalDates.id, festivalDateId),
        ),
      )
      .where(eq(reservationCollaborators.id, reservationCollaborationId))
      .limit(1);

    if (!target) {
      return {
        success: false,
        message: "La fecha no corresponde al festival del colaborador",
      };
    }

    await db.insert(collaboratorsAttendanceLogs).values({
      reservationCollaboratorId: reservationCollaborationId,
      festivalDateId: festivalDateId,
    });
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
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

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
