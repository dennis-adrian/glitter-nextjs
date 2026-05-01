"use server";

import { fetchStandById } from "@/app/api/stands/actions";
import { fetchBaseProfileById } from "@/app/api/users/actions";
import ReservationPaymentExtensionTemplate from "@/app/emails/reservation-payment-extension";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { sendEmail } from "@/app/vendors/resend";
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
	if (stand.festivalId !== festivalId) {
		return {
			success: false,
			message: "El espacio no pertenece a este festival",
		};
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
		const result = await db.transaction(async (tx) => {
			// Lock stand row and re-check status inside transaction to avoid race
			const [lockedStand] = await tx
				.select()
				.from(stands)
				.where(eq(stands.id, standId))
				.limit(1)
				.for("update");

			if (!lockedStand) {
				return { success: false, message: "El espacio no existe" };
			}
			if (lockedStand.festivalId !== festivalId) {
				return {
					success: false,
					message: "El espacio no pertenece a este festival",
				};
			}
			if (lockedStand.status === "reserved") {
				return {
					success: false,
					message: "El espacio ya está reservado",
				};
			}

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
				originalAmount: lockedStand.price ?? 0,
				amount: lockedStand.price ?? 0,
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

		if (typeof result === "object" && result && result.success === false) {
			return result;
		}

		const reservationId = result as number;
		revalidatePath("/dashboard/festivals");
		revalidatePath("/dashboard/reservations");

		return { success: true, message: "Reserva creada", reservationId };
	} catch (error: unknown) {
		console.error("Error creating admin reservation", error);
		// Concurrent reservation or unique constraint: treat as already reserved
		const code =
			error &&
			typeof error === "object" &&
			"code" in error &&
			typeof (error as { code: string }).code === "string"
				? (error as { code: string }).code
				: "";
		if (code === "23505" || code === "40001") {
			return {
				success: false,
				message: "El espacio ya está reservado",
			};
		}
		return { success: false, message: "Ups! No pudimos crear la reserva" };
	}
}

export async function extendReservationPaymentDeadline(params: {
	reservationId: number;
	newDueDate: Date;
}): Promise<{ success: boolean; message: string }> {
	const { reservationId, newDueDate } = params;

	const currentProfile = await getCurrentUserProfile();
	if (!currentProfile || currentProfile.role !== "admin") {
		return {
			success: false,
			message: "No tienes permisos para realizar esta acción",
		};
	}

	if (!(newDueDate instanceof Date) || Number.isNaN(newDueDate.getTime())) {
		return { success: false, message: "Fecha inválida" };
	}
	if (newDueDate.getTime() <= Date.now()) {
		return { success: false, message: "La nueva fecha debe ser futura" };
	}

	const reservation = await db.query.standReservations.findFirst({
		where: eq(standReservations.id, reservationId),
		with: {
			stand: true,
			festival: { with: { festivalDates: true } },
			participants: { with: { user: true } },
			scheduledTasks: true,
		},
	});

	if (!reservation) {
		return { success: false, message: "La reserva no existe" };
	}
	if (reservation.status !== "pending") {
		return {
			success: false,
			message: "Solo puedes extender reservas pendientes de pago",
		};
	}

	const activeTask = reservation.scheduledTasks.find(
		(t) => t.taskType === "stand_reservation" && t.completedAt === null,
	);

	if (activeTask && newDueDate.getTime() <= activeTask.dueDate.getTime()) {
		return {
			success: false,
			message: "La nueva fecha debe ser posterior a la fecha límite actual",
		};
	}

	const creator = reservation.participants[0]?.user;
	if (!creator) {
		return {
			success: false,
			message: "La reserva no tiene un participante asociado",
		};
	}

	try {
		await db.transaction(async (tx) => {
			if (activeTask) {
				await tx
					.update(scheduledTasks)
					.set({
						dueDate: newDueDate,
						reminderSentAt: sql`now()`,
						ranAfterDueDate: false,
						updatedAt: sql`now()`,
					})
					.where(eq(scheduledTasks.id, activeTask.id));
			} else {
				// When the payment deadline is extended, we send an email to the user
				// we don't need to send another reminder email
				await tx.insert(scheduledTasks).values({
					dueDate: newDueDate,
					reminderTime: sql`now()`,
					reminderSentAt: sql`now()`,
					profileId: creator.id,
					reservationId: reservation.id,
					taskType: "stand_reservation",
				});
			}
		});
	} catch (error) {
		console.error("Error extending reservation payment deadline", error);
		return {
			success: false,
			message: "No se pudo extender el plazo de pago",
		};
	}

	const targets: { to: string; profile: typeof creator }[] = [];
	for (const p of reservation.participants) {
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
				subject: "Nueva fecha límite de pago para tu reserva",
				react: ReservationPaymentExtensionTemplate({
					profile,
					reservation,
					newDueDate,
				}) as React.ReactElement,
			}),
		),
	);

	revalidatePath("/dashboard/reservations");
	revalidatePath("/dashboard/payments");

	return { success: true, message: "Plazo de pago extendido" };
}
