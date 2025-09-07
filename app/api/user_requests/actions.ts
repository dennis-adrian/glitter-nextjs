"use server";

import { fetchStandById } from "@/app/api/stands/actions";
import { UserRequest } from "@/app/api/user_requests/definitions";
import {
  fetchAdminUsers,
  fetchBaseProfileById,
  fetchUserProfileById,
} from "@/app/api/users/actions";
import ReservationCreatedEmailTemplate from "@/app/emails/reservation-created";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";
import { db } from "@/db";
import {
  invoices,
  reservationParticipants,
  scheduledTasks,
  standReservations,
  stands,
  userRequests,
  users,
} from "@/db/schema";
import { sendEmail } from "@/app/vendors/resend";
import { and, eq, not, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { BaseProfile } from "@/app/api/users/definitions";
import TermsAcceptanceEmailTemplate from "@/app/emails/terms-acceptance";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import { NewStandReservation } from "@/app/lib/repositories/reservations/types";

export async function fetchRequestsByUserId(userId: number) {
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
	}
}

export async function updateUserRequest(id: number, data: UserRequest) {
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
	}

	revalidatePath("/dashboard", "layout");
	return { success: true };
}

export async function fetchRequests(): Promise<UserRequest[]> {
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
	}
}

export async function updateReservationSimple(
	id: number,
	data: ReservationUpdateSimple,
) {
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
	try {
		await db.insert(userRequests).values(request);
	} catch (error) {
		console.error(error);
		return { message: "No se pudo crear la solicitud", success: false };
	}

	revalidatePath("/my_profile");
	return { success: true, message: "Solicitud enviada correctamente" };
}

export async function addUserToFestival(
	profile: BaseProfile,
	festival: FestivalBase,
) {
	try {
		await db.insert(userRequests).values({
			userId: profile.id,
			festivalId: festival.id,
			status: "accepted",
			type: "festival_participation",
		});

		const admins = await fetchAdminUsers();
		const adminEmails = admins.map((admin) => admin.email);
		if (admins.length > 0) {
			await sendEmail({
				to: [...adminEmails],
				from: "Inscripciones Glitter <inscripciones@productoraglitter.com>",
				subject: `${profile.displayName} se ha inscrito a ${festival.name}`,
				react: TermsAcceptanceEmailTemplate({
					profile: profile,
					festival: festival,
				}) as React.ReactElement,
			});
		}
	} catch (error) {
		console.error(error);
		return { success: false, message: "Error al solicitar participación" };
	}

	// revalidatePath("/");
	return { success: true, message: "Ya estás habilitado para participar." };
}
