"use server";

import { UserRequest } from "@/app/api/user_requests/definitions";
import { db, pool } from "@/db";
import {
  reservationParticipants,
  standReservations,
  stands,
  userRequests,
  users,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function fetchRequestsByUserId(userId: number) {
  const client = await pool.connect();

  try {
    const requests = await db.query.userRequests.findMany({
      where: eq(userRequests.userId, userId),
      with: {
        user: true,
        festival: true,
      },
    });

    return requests;
  } catch (error) {
    console.error("Error fetching user requests", error);
    return [];
  } finally {
    client.release();
  }
}

export async function updateUserRequest(id: number, data: UserRequest) {
  const client = await pool.connect();
  const { status, user, type } = data;
  const userRole = user.role;
  const newRole = status === "accepted" ? "artist" : "user";
  try {
    db.transaction(async (tx) => {
      await tx
        .update(userRequests)
        .set({ status, updatedAt: new Date() })
        .where(eq(userRequests.id, id));

      if (userRole !== "admin" && type === "become_artist") {
        await tx
          .update(users)
          .set({ role: newRole, updatedAt: new Date() })
          .where(eq(users.id, data.userId));
      }
    });
  } catch (error) {
    console.error("Error updating user request", error);
    return { message: "Error updating user request" };
  } finally {
    client.release();
  }

  revalidatePath("/dashboard", "layout");
  return { success: true };
}

export async function fetchRequests(): Promise<UserRequest[]> {
  const client = await pool.connect();

  try {
    const requests = await db.query.userRequests.findMany({
      with: {
        user: true,
        festival: true,
      },
    });

    return requests;
  } catch (error) {
    console.error("Error fetching user requests", error);
    return [];
  } finally {
    client.release();
  }
}

// TODO: Move this to its own file
export type NewStandReservation = typeof standReservations.$inferInsert & {
  participantIds: number[];
};
export async function createReservation(reservation: NewStandReservation) {
  const client = await pool.connect();
  try {
    const { festivalId, standId, participantIds } = reservation;
    await db.transaction(async (tx) => {
      const rows = await tx
        .insert(standReservations)
        .values({
          festivalId,
          standId,
        })
        .returning({ reservationId: standReservations.id });

      const reservationId = rows[0].reservationId;

      const participantValues = participantIds.map((userId) => ({
        userId,
        reservationId,
      }));

      await tx.insert(reservationParticipants).values(participantValues);

      await tx
        .update(stands)
        .set({ status: "reserved", updatedAt: new Date() })
        .where(eq(stands.id, standId));
    });
  } catch (error) {
    console.error("Error creating reservation", error);
    return { success: false };
  } finally {
    client.release();
  }

  revalidatePath("next_event");
  return { success: true };
}

// TODO: Move this to its own file once I ƒigure out that 'fs' error
export type ReservationStatus =
  (typeof standReservations.$inferSelect)["status"];
export type StandStatus = (typeof stands.$inferSelect)["status"];
export type ReservationUpdate = typeof standReservations.$inferInsert & {
  updatedParticipants?: {
    participationId: number | undefined;
    userId: number | undefined;
  }[];
};
export async function updateReservation(id: number, data: ReservationUpdate) {
  const client = await pool.connect();

  try {
    const { status, standId, updatedParticipants } = data;
    await db.transaction(async (tx) => {
      await tx
        .update(standReservations)
        .set({ status, updatedAt: new Date() })
        .where(eq(standReservations.id, id));

      let standStatus: StandStatus = "available";
      if (status === "accepted") {
        standStatus = "confirmed";
      }
      if (status === "pending") {
        standStatus = "reserved";
      }
      await tx
        .update(stands)
        .set({ status: standStatus, updatedAt: new Date() })
        .where(eq(stands.id, standId));

      if (updatedParticipants && updatedParticipants?.length > 0) {
        updatedParticipants.forEach(async (participant) => {
          if (participant.participationId) {
            if (participant.userId) {
              await tx
                .update(reservationParticipants)
                .set({ userId: participant.userId, updatedAt: new Date() })
                .where(
                  eq(reservationParticipants.id, participant.participationId),
                );
            } else {
              await tx
                .delete(reservationParticipants)
                .where(
                  eq(reservationParticipants.id, participant.participationId),
                );
            }
          } else {
            if (participant.userId) {
              await tx.insert(reservationParticipants).values({
                userId: participant.userId,
                reservationId: id,
              });
            }
          }
        });
      }
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
type NewUserRequest = typeof userRequests.$inferInsert;
export async function createUserRequest(
  request: NewUserRequest,
  prevState: FormState,
) {
  const client = await pool.connect();

  try {
    await db.insert(userRequests).values(request);
  } catch (error) {
    console.error(error);
    return { message: "No se pudo crear la solicitud", success: false };
  } finally {
    client.release();
  }

  revalidatePath("/user_profile");
  return { success: true, message: "Solicitud enviada correctamente" };
}

export async function addUserToFestival(userId: number, festivalId: number) {
  const client = await pool.connect();

  try {
    await db.insert(userRequests).values({
      userId,
      festivalId,
      status: "accepted",
      type: "festival_participation",
    });
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al solicitar participación" };
  } finally {
    client.release();
  }

  // revalidatePath("/");
  return { success: true, message: "Ya puedes reservar tu espacio" };
}
