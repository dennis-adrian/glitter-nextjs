"use server";

import { db } from "@/db";
import {
  collaborators,
  reservationCollaborators,
  standReservations,
} from "@/db/schema";
import { Collaborator, NewCollaborator } from "./definitions";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import {
  FullReservation,
} from "@/app/api/reservations/definitions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import {
  canMutateReservationCollaborators,
  canViewAdminReservationData,
} from "@/app/lib/reservations/policy";
import {
  addCollaboratorSchema,
  deleteCollaboratorSchema,
  parseUnknown,
} from "@/app/lib/reservations/schemas";

export const addCollaborator = async (
  reservationId: number,
  collaborator: NewCollaborator | Collaborator,
) => {
  const actor = await getCurrentUserProfile();
  if (!actor) {
    return { success: false, message: "Tenés que iniciar sesión para continuar." };
  }

  const parsed = parseUnknown(addCollaboratorSchema, {
    reservationId,
    firstName: collaborator.firstName,
    lastName: collaborator.lastName,
    identificationNumber: collaborator.identificationNumber,
    collaboratorId: "id" in collaborator ? collaborator.id : undefined,
  });
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }

  const reservation = await db.query.standReservations.findFirst({
    where: eq(standReservations.id, parsed.data.reservationId),
    with: { participants: true },
  });
  if (!reservation) {
    return { success: false, message: "La reserva no existe." };
  }
  if (
    !canMutateReservationCollaborators({
      actor: { id: actor.id, role: actor.role },
      participantUserIds: reservation.participants.map((p) => p.userId),
    })
  ) {
    return { success: false, message: "No estás autorizado para esta reserva." };
  }

  let response: {
    success: boolean;
    message: string;
  };

  try {
    response = await db.transaction(async (tx) => {
      if (parsed.data.collaboratorId) {
        const associations = await tx.query.reservationCollaborators.findMany({
          where: eq(
            reservationCollaborators.collaboratorId,
            parsed.data.collaboratorId,
          ),
          with: {
            reservation: {
              with: { participants: true },
            },
          },
        });

        const canReuseCollaborator = associations.some(
          (association) =>
            association.reservationId === parsed.data.reservationId ||
            canMutateReservationCollaborators({
              actor: { id: actor.id, role: actor.role },
              participantUserIds: association.reservation.participants.map(
                (participant) => participant.userId,
              ),
            }),
        );

        if (!canReuseCollaborator) {
          return {
            success: false,
            message: "No estás autorizado para agregar esta persona.",
          };
        }

        await tx.insert(reservationCollaborators).values({
          reservationId: parsed.data.reservationId,
          collaboratorId: parsed.data.collaboratorId,
        });

        return {
          success: true,
          message: "Persona agregada correctamente.",
        };
      } else {
        const [{ id: collaboratorId }] = await tx
          .insert(collaborators)
          .values({
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
            identificationNumber: parsed.data.identificationNumber,
          })
          .returning({ id: collaborators.id });

        await tx.insert(reservationCollaborators).values({
          reservationId: parsed.data.reservationId,
          collaboratorId,
        });

        return {
          success: true,
          message: "Persona agregada correctamente.",
        };
      }
    });
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Error al agregar persona.",
    };
  }

  revalidatePath("/my_participations");
  return response;
};

export const deleteReservationCollaborator = async (
  reservationId: number,
  collaboratorId: number,
) => {
  const actor = await getCurrentUserProfile();
  if (!actor) {
    return { success: false, message: "Tenés que iniciar sesión para continuar." };
  }

  const parsed = parseUnknown(deleteCollaboratorSchema, {
    reservationId,
    collaboratorId,
  });
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }

  const reservation = await db.query.standReservations.findFirst({
    where: eq(standReservations.id, parsed.data.reservationId),
    with: { participants: true },
  });
  if (!reservation) {
    return { success: false, message: "La reserva no existe." };
  }
  if (
    !canMutateReservationCollaborators({
      actor: { id: actor.id, role: actor.role },
      participantUserIds: reservation.participants.map((p) => p.userId),
    })
  ) {
    return { success: false, message: "No estás autorizado para esta reserva." };
  }

  try {
    await db
      .delete(reservationCollaborators)
      .where(
        and(
          eq(reservationCollaborators.reservationId, parsed.data.reservationId),
          eq(reservationCollaborators.collaboratorId, parsed.data.collaboratorId),
        ),
      );
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Error al eliminar persona.",
    };
  }

  revalidatePath("/my_participations");
  return {
    success: true,
    message: "Persona eliminada correctamente.",
  };
};

export async function fetchReservationsByFestivalId(
  festivalId: number,
): Promise<FullReservation[]> {
  const actor = await getCurrentUserProfile();
  if (
    !actor ||
    !canViewAdminReservationData({ id: actor.id, role: actor.role })
  ) {
    return [];
  }

  try {
    return await db.query.standReservations.findMany({
      where: eq(standReservations.festivalId, festivalId),
      with: {
        stand: true,
        festival: {
          with: {
            festivalDates: true,
          },
        },
        participants: {
          with: {
            user: {
              with: {
                userSocials: true,
                profileSubcategories: {
                  with: {
                    subcategory: true,
                  },
                },
              },
            },
          },
        },
        externalParticipants: {
          with: {
            externalParticipant: true,
          },
        },
        collaborators: {
          with: {
            collaborator: true,
          },
        },
        invoices: {
          with: {
            payments: true,
          },
        },
        scheduledTasks: true,
      },
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}
