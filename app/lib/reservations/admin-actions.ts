"use server";

import { fetchStandById } from "@/app/api/stands/actions";
import { fetchBaseProfileById } from "@/app/api/users/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
	invoices,
	reservationParticipants,
	scheduledTasks,
	standReservations,
	stands,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createAdminReservation(params: {
	festivalId: number;
	standId: number;
	userId: number;
	partnerId?: number;
}): Promise<{ success: boolean; message: string; reservationId?: number }> {
	const { festivalId, standId, userId, partnerId } = params;

	const currentProfile = await getCurrentUserProfile();
	if (!currentProfile || currentProfile.role !== "admin") {
		return {
			success: false,
			message: "No tienes permisos para realizar esta acción",
		};
	}

	const stand = await fetchStandById(standId);
	if (!stand) {
		return { success: false, message: "El espacio no existe" };
	}
	if (stand.status === "reserved") {
		return { success: false, message: "El espacio ya está reservado" };
	}

	const forUser = await fetchBaseProfileById(userId);
	if (!forUser) {
		return { success: false, message: "El usuario no existe" };
	}
	if (forUser.status !== "verified") {
		return { success: false, message: "El usuario no está verificado" };
	}

	if (partnerId != null) {
		if (partnerId === userId) {
			return {
				success: false,
				message: "El compañero no puede ser el mismo que el usuario principal",
			};
		}
		const partner = await fetchBaseProfileById(partnerId);
		if (!partner) {
			return { success: false, message: "El usuario compañero no existe" };
		}
		if (partner.status !== "verified") {
			return {
				success: false,
				message: "El usuario compañero no está verificado",
			};
		}
	}

	try {
		const reservationId = await db.transaction(async (tx) => {
			const [reservation] = await tx
				.insert(standReservations)
				.values({ festivalId, standId })
				.returning();

			const participantIds = [userId];
			if (partnerId && partnerId !== userId) participantIds.push(partnerId);

			await tx.insert(reservationParticipants).values(
				participantIds.map((uid) => ({
					userId: uid,
					reservationId: reservation.id,
				})),
			);

			await tx
				.update(stands)
				.set({ status: "reserved", updatedAt: new Date() })
				.where(eq(stands.id, standId));

			await tx.insert(invoices).values({
				date: new Date(),
				userId,
				reservationId: reservation.id,
				originalAmount: stand.price ?? 0,
				amount: stand.price ?? 0,
			});

			await tx.insert(scheduledTasks).values({
				dueDate: sql`now() + interval '5 days'`,
				reminderTime: sql`now() + interval '4 days'`,
				profileId: userId,
				reservationId: reservation.id,
				taskType: "stand_reservation",
			});

			return reservation.id;
		});

		revalidatePath("/dashboard/festivals");
		revalidatePath("/dashboard/reservations");

		return { success: true, message: "Reserva creada", reservationId };
	} catch (error) {
		console.error("Error creating admin reservation", error);
		return { success: false, message: "Ups! No pudimos crear la reserva" };
	}
}
