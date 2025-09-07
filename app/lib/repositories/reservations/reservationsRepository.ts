"use server";

import { ReservationBase } from "@/app/api/reservations/definitions";
import { ErrorCodes } from "@/lib/errors/codes";
import { NewStandReservation } from "@/lib/repositories/reservations/types";
import { db } from "@/db";
import {
	reservationParticipants,
	stands,
	standReservations,
	invoices,
	scheduledTasks,
} from "@/db/schema";
import { and, DrizzleError, eq, not, sql } from "drizzle-orm";

export const findBlockingReservations = async (
	standId: number,
): Promise<ReservationBase[]> => {
	try {
		return await db.query.standReservations.findMany({
			where: and(
				eq(standReservations.standId, standId),
				not(eq(standReservations.status, "rejected")),
			),
		});
	} catch (e) {
		const drizzleError = e as DrizzleError;
		if (drizzleError.cause) {
			const errorCause = drizzleError.cause as {
				code?: string;
			};

			if (errorCause.code === "ECONNREFUSED") {
				throw new Error(ErrorCodes.DB_CONNECTION_ERROR);
			}
		}

		throw e;
	}
};

export const create = async (
	reservation: NewStandReservation,
	price: number,
): Promise<ReservationBase> => {
	const { festivalId, standId, participantIds } = reservation;
	try {
		return await db.transaction(async (tx) => {
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

			await tx.insert(scheduledTasks).values({
				dueDate: sql`now() + interval '5 days'`,
				reminderTime: sql`now() + interval '4 days'`,
				profileId: participantIds[0],
				reservationId: reservationId,
				taskType: "stand_reservation",
			});

			return rows[0];
		});
	} catch (error) {
		throw error;
	}
};
