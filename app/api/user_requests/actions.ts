"use server";

import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/actions";
import { UserRequest } from "@/app/api/user_requests/definitions";
import { db, pool } from "@/db";
import {
  userRequests,
  users,
  standReservations,
  reservationParticipants,
  stands,
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
        .set({ status: "reserved" })
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
        .set({ status })
        .where(eq(standReservations.id, id));

      const standStatus = status === "accepted" ? "confirmed" : "available";
      await tx
        .update(stands)
        .set({ status: standStatus })
        .where(eq(stands.id, standId));

      if (updatedParticipants && updatedParticipants?.length > 0) {
        await tx
          .update(reservationParticipants)
          .set({ userId: updatedParticipants[0].userId })
          .where(
            eq(
              reservationParticipants.id,
              updatedParticipants[0].participationId!,
            ),
          );

        debugger;
        if (updatedParticipants[1].userId) {
          if (updatedParticipants[1].participationId) {
            await tx
              .update(reservationParticipants)
              .set({ userId: updatedParticipants[1].userId })
              .where(
                eq(
                  reservationParticipants.id,
                  updatedParticipants[1].participationId,
                ),
              );
          }

          if (!updatedParticipants[1].participationId) {
            await tx.insert(reservationParticipants).values({
              userId: updatedParticipants[1].userId as number,
              reservationId: id,
            });
          }
        }

        if (updatedParticipants[1].participationId) {
          await tx
            .delete(reservationParticipants)
            .where(
              and(
                eq(reservationParticipants.reservationId, id),
                eq(
                  reservationParticipants.id,
                  updatedParticipants[1].participationId,
                ),
              ),
            );
        }
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
