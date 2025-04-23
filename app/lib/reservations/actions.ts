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
import { FullReservation } from "@/app/api/reservations/definitions";

export const addCollaborator = async (
  reservationId: number,
  collaborator: NewCollaborator | Collaborator,
) => {
  let response: {
    success: boolean;
    message: string;
  };

  try {
    response = await db.transaction(async (tx) => {
      if (collaborator.id) {
        await tx.insert(reservationCollaborators).values({
          reservationId,
          collaboratorId: collaborator.id,
        });

        return {
          success: true,
          message: "Colaborador agregado correctamente.",
        };
      } else {
        const [{ id: collaboratorId }] = await tx
          .insert(collaborators)
          .values({
            firstName: collaborator.firstName,
            lastName: collaborator.lastName,
            identificationNumber: collaborator.identificationNumber,
          })
          .returning({ id: collaborators.id });

        await tx.insert(reservationCollaborators).values({
          reservationId,
          collaboratorId,
        });

        return {
          success: true,
          message: "Colaborador agregado correctamente.",
        };
      }
    });
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Error al agregar colaborador.",
    };
  }

  revalidatePath("/my_participations");
  return response;
};

export const deleteReservationCollaborator = async (
  reservationId: number,
  collaboratorId: number,
) => {
  try {
    await db.delete(collaborators).where(eq(collaborators.id, collaboratorId));
    // TODO: this code is here to delete the reservationCollaborator record without actually
    // deleting the collaborator record. This might be useful in the future
    // if we want to keep the collaborator record for future reference.
    // await db
    //   .delete(reservationCollaborators)
    //   .where(
    //     and(
    //       eq(reservationCollaborators.reservationId, reservationId),
    //       eq(reservationCollaborators.collaboratorId, collaboratorId),
    //     ),
    //   );
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Error al eliminar colaborador.",
    };
  }

  revalidatePath("/my_participations");
  return {
    success: true,
    message: "Colaborador eliminado correctamente.",
  };
};

export async function fetchReservationsByFestivalId(
  festivalId: number,
): Promise<FullReservation[]> {
  try {
    return await db.query.standReservations.findMany({
      where: eq(standReservations.festivalId, festivalId),
      with: {
        stand: true,
        festival: true,
        participants: {
          with: {
            user: {
              with: {
                userSocials: true,
                profileSubcategories: {
                  with: {
                    subcategory: true,
                  }
                }
              },
            },
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
      },
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}
