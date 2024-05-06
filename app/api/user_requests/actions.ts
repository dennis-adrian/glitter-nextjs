"use server";

import { fetchStandById } from "@/app/api/stands/actions";
import { UserRequest } from "@/app/api/user_requests/definitions";
import {
  fetchAdminUsers,
  fetchBaseProfileById,
  fetchUserProfile,
} from "@/app/api/users/actions";
import { fetchBaseFestival } from "@/app/data/festivals/actions";
import ReservationCreatedEmailTemplate from "@/app/emails/reservation-created";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";
import { db, pool } from "@/db";
import {
  invoices,
  reservationParticipants,
  standReservations,
  stands,
  userRequests,
  users,
} from "@/db/schema";
import { sendEmail } from "@/app/vendors/resend";
import { eq } from "drizzle-orm";
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
export async function createReservation(
  reservation: NewStandReservation,
  price: number,
) {
  const client = await pool.connect();
  try {
    const { festivalId, standId, participantIds } = reservation;
    const newReservation = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(standReservations)
        .values({
          festivalId,
          standId,
        })
        .returning();

      const reservationId = rows[0].id;

      const participantValues = participantIds.map((userId) => ({
        userId,
        reservationId,
      }));

      await tx.insert(reservationParticipants).values(participantValues);

      await tx
        .update(stands)
        .set({ status: "reserved", updatedAt: new Date() })
        .where(eq(stands.id, standId));

      await tx.insert(invoices).values({
        date: new Date(),
        userId: participantIds[0],
        reservationId: reservationId,
        amount: price,
      });

      return rows[0];
    });

    const festival = await fetchBaseFestival(festivalId);
    const creator = await fetchBaseProfileById(participantIds[0]);
    const stand = await fetchStandById(standId);
    const admins = await fetchAdminUsers();
    const adminEmails = admins.map((admin) => admin.email);
    await sendEmail({
      to: [...adminEmails, "reservas@productoraglitter.com"],
      from: "Reservas Glitter <reservas@festivalglitter.art>",
      subject: "Nueva reserva creada",
      react: ReservationCreatedEmailTemplate({
        festivalName: festival?.name || "Festival",
        reservation: newReservation,
        creatorName: creator?.displayName || "Usuario",
        standName: `${stand?.label}${stand?.standNumber}` || "sin stand",
        standCategory: getCategoryOccupationLabel(stand?.standCategory, {
          singular: false,
        }),
      }) as React.ReactElement,
    });
  } catch (error) {
    console.error("Error creating reservation", error);
    return { success: false, message: "No se pudo crear la reserva" };
  } finally {
    client.release();
  }

  revalidatePath("/next_event");
  return { success: true, message: "Reserva creada" };
}

export async function updateReservationSimple(
  id: number,
  data: ReservationUpdateSimple,
) {
  const client = await pool.connect();
  const { status, standId, partner } = data;
  try {
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

      if (partner) {
        if (partner.participationId) {
          if (partner.userId) {
            await tx
              .update(reservationParticipants)
              .set({ userId: partner.userId, updatedAt: new Date() })
              .where(eq(reservationParticipants.id, partner.participationId));
          } else {
            await tx
              .delete(reservationParticipants)
              .where(eq(reservationParticipants.id, partner.participationId));
          }
        } else {
          if (partner.userId) {
            await tx.insert(reservationParticipants).values({
              userId: partner.userId,
              reservationId: id,
            });
          }
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
export type ReservationUpdateSimple = typeof standReservations.$inferInsert & {
  partner?: {
    participationId: number | undefined;
    userId: number | undefined;
  };
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
