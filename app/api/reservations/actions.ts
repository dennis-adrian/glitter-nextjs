"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, pool } from "@/db";
import {
  reservationParticipants,
  scheduledTasks,
  standReservations,
  stands,
} from "@/db/schema";

import { BaseProfile } from "@/app/api/users/definitions";
import { sendEmail } from "@/app/vendors/resend";
import EmailTemplate from "@/app/emails/reservation-confirmation";
import React from "react";
import {
  ReservationWithParticipantsAndUsers,
  ReservationWithParticipantsAndUsersAndStand,
  ReservationWithParticipantsAndUsersAndStandAndFestival,
} from "@/app/api/reservations/definitions";
import { FestivalWithDates } from "@/app/data/festivals/definitions";

export async function fetchReservations(): Promise<
  ReservationWithParticipantsAndUsersAndStandAndFestival[]
> {
  const client = await pool.connect();

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
      },
      orderBy: desc(standReservations.updatedAt),
    });
  } catch (error) {
    console.error(error);
    return [];
  } finally {
    client.release();
  }
}

export async function fetchConfirmedReservationsByFestival(
  festivalId: number,
): Promise<ReservationWithParticipantsAndUsers[]> {
  const client = await pool.connect();

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
      },
    });
  } catch (error) {
    console.error(error);
    return [];
  } finally {
    client.release();
  }
}

export async function fetchReservation(
  id: number,
): Promise<
  ReservationWithParticipantsAndUsersAndStandAndFestival | undefined | null
> {
  const client = await pool.connect();
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
  } finally {
    client.release();
  }
}

export async function updateReservation(
  id: number,
  data: ReservationWithParticipantsAndUsersAndStand,
): Promise<{ success: boolean; message: string }> {
  const client = await pool.connect();

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
  } finally {
    client.release();
  }

  revalidatePath("/dashboard/reservations");
  return { success: true, message: "Reserva actualizada" };
}

type FormState = {
  success: boolean;
  message: string;
};

export async function deleteReservation(
  reservationId: number,
  standId: number,
  prevState: FormState,
) {
  const client = await pool.connect();

  try {
    await db.transaction(async (tx) => {
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
  } finally {
    client.release();
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
) {
  const client = await pool.connect();

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

    await sendEmail({
      to: [user.email],
      from: "Reservas Glitter <reservas@productoraglitter.com>",
      subject: "Reserva confirmada",
      react: EmailTemplate({
        name: user.displayName!,
        standLabel,
        festival,
      }) as React.ReactElement,
    });
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al confirmar la reserva" };
  } finally {
    client.release();
  }

  revalidatePath("/dashboard/payments");
  return { success: true, message: "Reserva confirmada" };
}
