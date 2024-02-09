"use server";

import { BaseProfile, ProfileWithSocials } from "@/app/api/users/definitions";
import { db, pool } from "@/db";
import {
  reservationParticipants,
  standReservations,
  stands,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type Participant = typeof reservationParticipants.$inferSelect & {
  user: ProfileWithSocials;
};
export type ReservationWithParticipantsAndUsers =
  typeof standReservations.$inferSelect & {
    participants: Participant[];
  };

export type ReservationWithParticipantsAndUsersAndStand =
  ReservationWithParticipantsAndUsers & {
    stand: typeof stands.$inferSelect;
  };

export async function fetchReservations(): Promise<
  ReservationWithParticipantsAndUsersAndStand[]
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
      },
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
): Promise<ReservationWithParticipantsAndUsersAndStand | undefined | null> {
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
      },
    });
  } catch (error) {
    console.error(error);
    return null;
  } finally {
    client.release();
  }

  revalidatePath("/dashboard/reservations");
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

export async function createReservation(
  festivalId: number,
  participants: BaseProfile[],
  prevState: {} | null,
  data: FormData,
) {
  const client = await pool.connect();
  try {
    const standId = parseInt(data.get("stand") as string);
    await db.transaction(async (tx) => {
      const newReservation = await tx
        .insert(standReservations)
        .values({ standId, festivalId })
        .returning({ reservationId: standReservations.id });

      const reservationId = newReservation[0].reservationId;

      if (participants.length > 0) {
        const participantsValues = participants.map((participant) => ({
          userId: participant.id,
          reservationId,
        }));

        await tx.insert(reservationParticipants).values(participantsValues);
      }
    });
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al crear la reserva" };
  } finally {
    client.release();
  }

  revalidatePath("/dashboard/reservations");
  redirect("/dashboard/reservations");
}

export async function logHello(
  currentState: { message: string; success: boolean } | undefined,
  formData: FormData,
) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (formData.get("test") === "hello") {
    return {
      message: "Your submission was correct",
      success: true,
    };
  } else {
    return {
      message: "There was a problem with your submission",
      success: false,
    };
  }
}
