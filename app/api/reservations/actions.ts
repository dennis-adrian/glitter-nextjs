"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { scheduledTasks, standReservations, stands, users } from "@/db/schema";

import { BaseProfile } from "@/app/api/users/definitions";
import { sendEmail } from "@/app/vendors/resend";
import EmailTemplate from "@/app/emails/reservation-confirmation";
import React from "react";
import {
  ReservationWithParticipantsAndUsers,
  ReservationWithParticipantsAndUsersAndStand,
  ReservationWithParticipantsAndUsersAndStandAndCollaborators,
  ReservationWithParticipantsAndUsersAndStandAndFestival,
  ReservationWithParticipantsAndUsersAndStandAndFestivalAndInvoicesWithPayments,
} from "@/app/api/reservations/definitions";
import ReservationRejectionEmailTemplate from "@/app/emails/reservation-rejection";
import { getUserName } from "@/app/lib/users/utils";
import { buildWhereClauseForReservationsFetching } from "@/app/api/reservations/helpers";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { ReservationParticipantWithUser } from "@/app/data/invoices/definitions";

export async function fetchReservations(options: {
  query?: string;
  festivalId?: number;
}): Promise<
  ReservationWithParticipantsAndUsersAndStandAndFestivalAndInvoicesWithPayments[]
> {
  const whereClause = await buildWhereClauseForReservationsFetching({
    ...options,
  });

  try {
    return db.query.standReservations.findMany({
      with: {
        participants: {
          with: {
            user: {
              with: {
                userSocials: true,
              },
            },
          },
        },
        stand: true,
        festival: true,
        invoices: {
          with: {
            payments: true,
          },
        },
      },
      orderBy: desc(standReservations.updatedAt),
      where: whereClause.queryChunks.length > 0 ? and(whereClause) : undefined,
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function fetchConfirmedReservationsByFestival(
  festivalId: number,
): Promise<ReservationWithParticipantsAndUsersAndStandAndCollaborators[]> {
  try {
    return db.query.standReservations.findMany({
      where: and(
        eq(standReservations.festivalId, festivalId),
        eq(standReservations.status, "accepted"),
      ),
      with: {
        participants: {
          with: {
            user: {
              with: {
                userSocials: true,
              },
            },
          },
        },
        stand: true,
        collaborators: {
          with: {
            collaborator: true,
          },
        },
      },
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function fetchReservation(
  id: number,
): Promise<
  ReservationWithParticipantsAndUsersAndStandAndFestival | undefined | null
> {
  try {
    return await db.query.standReservations.findFirst({
      where: eq(standReservations.id, id),
      with: {
        participants: {
          with: {
            user: {
              with: {
                userSocials: true,
              },
            },
          },
        },
        stand: true,
        festival: true,
      },
    });
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function updateReservation(
  id: number,
  data: ReservationWithParticipantsAndUsersAndStand,
): Promise<{ success: boolean; message: string }> {
  try {
    const { status, standId } = data;
    await db.transaction(async (tx) => {
      await tx
        .update(standReservations)
        .set({ status })
        .where(eq(standReservations.id, id));

      const standStatus = status === "accepted" ? "confirmed" : "available";
      await tx
        .update(stands)
        .set({ status: standStatus })
        .where(eq(stands.id, standId));
    });
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al actualizar la reserva" };
  }

  revalidatePath("/dashboard/reservations");
  return { success: true, message: "Reserva actualizada" };
}

export async function deleteReservation(
  reservationId: number,
  standId: number,
) {
  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(scheduledTasks)
        .where(eq(scheduledTasks.reservationId, reservationId));

      await tx
        .delete(standReservations)
        .where(eq(standReservations.id, reservationId));

      await tx
        .update(stands)
        .set({ status: "available" })
        .where(eq(stands.id, standId));
    });
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al eliminar la reserva" };
  }

  revalidatePath("/dashboard/reservations");
  return { success: true, message: "Reserva eliminada" };
}

export async function confirmReservation(
  reservationId: number,
  user: BaseProfile,
  standId: number,
  standLabel: string,
  festival: FestivalWithDates,
  participants: ReservationParticipantWithUser[]
) {
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(standReservations)
        .set({ status: "accepted", updatedAt: new Date() })
        .where(eq(standReservations.id, reservationId));

      await tx
        .update(stands)
        .set({ status: "confirmed" })
        .where(eq(stands.id, standId));

      await tx
        .update(scheduledTasks)
        .set({ completedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(scheduledTasks.reservationId, reservationId),
            eq(scheduledTasks.taskType, "stand_reservation"),
          ),
        );
    });

    const targets: { to: string; profile: BaseProfile }[] = [];
    if (user.email?.trim()) targets.push({ to: user.email.trim(), profile: user });
    for (const p of participants) {
      const email = p.user?.email?.trim();
      if (!email) continue;
      targets.push({ to: email, profile: p.user });
    }
    const seen = new Set<string>();
    const uniqueTargets = targets.filter(({ to }) => {
      const key = to.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    await Promise.allSettled(
      uniqueTargets.map(({ to, profile }) =>
        sendEmail({
          to: [to],
          from: "Reservas Glitter <reservas@productoraglitter.com>",
          subject: `Reserva confirmada para el festival ${festival.name}`,
          react: EmailTemplate({
            profile,
            standLabel,
            festival,
          }) as React.ReactElement,
        }),
      ),
    );

  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al confirmar la reserva" };
  }

  revalidatePath("/dashboard/payments");
  return { success: true, message: "Reserva confirmada" };
}

export async function rejectReservation(
  reservation: ReservationWithParticipantsAndUsersAndStandAndFestival,
  reason?: string,
) {
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(standReservations)
        .set({ status: "rejected", updatedAt: sql`now()` })
        .where(eq(standReservations.id, reservation.id));

      await tx
        .update(stands)
        .set({ status: "available" })
        .where(eq(stands.id, reservation.standId));
    });

    reservation.participants.forEach((participant) => {
      const userName = getUserName(participant.user);
      sendEmail({
        to: [participant.user.email],
        from: "Equipo Glitter <equipo@productoraglitter.com>",
        subject: `${userName}, tu reserva ha sido eliminada`,
        react: ReservationRejectionEmailTemplate({
          festival: reservation.festival,
          profile: participant.user,
          stand: reservation.stand,
          reason,
        }),
      });
    });
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al rechazar la reserva" };
  }

  revalidatePath("/dashboard/reservations");
  return { success: true, message: "Reserva rechazada correctamente" };
}
