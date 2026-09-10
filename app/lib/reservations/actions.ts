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
import { FullReservationWithTender } from "@/app/api/reservations/definitions";
import {
  fetchInvoiceTenders,
  tenderFor,
} from "@/app/lib/payments/tender-queries";
import { summarizeFeatureCredits } from "@/app/lib/payments/feature-credits";
import { fetchReservationFeatureCredits } from "@/app/lib/payments/feature-credits-queries";
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
    return {
      success: false,
      message: "Tenés que iniciar sesión para continuar.",
    };
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
    return {
      success: false,
      message: "No estás autorizado para esta reserva.",
    };
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
    return {
      success: false,
      message: "Tenés que iniciar sesión para continuar.",
    };
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
    return {
      success: false,
      message: "No estás autorizado para esta reserva.",
    };
  }

  try {
    await db
      .delete(reservationCollaborators)
      .where(
        and(
          eq(reservationCollaborators.reservationId, parsed.data.reservationId),
          eq(
            reservationCollaborators.collaboratorId,
            parsed.data.collaboratorId,
          ),
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
): Promise<FullReservationWithTender[]> {
  const actor = await getCurrentUserProfile();
  if (
    !actor ||
    !canViewAdminReservationData({ id: actor.id, role: actor.role })
  ) {
    return [];
  }

  try {
    const reservations = await db.query.standReservations.findMany({
      where: eq(standReservations.festivalId, festivalId),
      with: {
        stand: true,
        members: { with: { stand: true } },
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
          // Ordered so `invoices[0]` is the same row on every read. A
          // reservation carries exactly one invoice — both creation sites
          // insert one, and 1,765 of 1,765 rows hold to it — but the relational
          // builder returns them unordered, so the pick was only stable by
          // luck. The columns read `invoices[0]` from this same array, so one
          // ordering keeps the query and the cell agreeing.
          orderBy: (invoice, { asc }) => [asc(invoice.id)],
          with: {
            payments: true,
            // The person who owes, and whose credits apply — not the same
            // question as who is on the stand.
            user: true,
          },
        },
        scheduledTasks: true,
      },
    });

    // One reservation carries one invoice, so coverage is resolved for the
    // whole page in a single extra round rather than per row.
    const invoiceAmounts = new Map(
      reservations.flatMap((reservation) =>
        reservation.invoices.map(
          (invoice) => [invoice.id, invoice.amount] as const,
        ),
      ),
    );
    // The reservation's other ledger: credits spent on features never reach
    // the invoice, so a reservation billed for one person can be standing with
    // two and nothing in `tender` says how.
    const [tenders, featureCredits] = await Promise.all([
      fetchInvoiceTenders([...invoiceAmounts.keys()], invoiceAmounts),
      fetchReservationFeatureCredits(reservations.map(({ id }) => id)),
    ]);

    return reservations.map((reservation) => {
      const invoice = reservation.invoices[0];
      return {
        ...reservation,
        tender: invoice ? tenderFor(tenders, invoice.id) : null,
        featureCredits: summarizeFeatureCredits(
          featureCredits.get(reservation.id) ?? [],
        ),
      };
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}
