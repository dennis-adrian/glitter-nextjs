"use server";

import { ReservationBase } from "@/app/api/reservations/definitions";
import {
	FestivalWithDates,
	FestivalWithUserRequests,
} from "@/app/lib/festivals/definitions";
import { db } from "@/db";
import {
	reservationParticipants,
	standReservations,
	stands,
	users,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type Participant = typeof reservationParticipants.$inferSelect & {
	user: typeof users.$inferSelect;
};
type StandReservation = typeof standReservations.$inferSelect & {
	participants: Participant[];
};
export type Stand = typeof stands.$inferSelect & {
	reservations: StandReservation[];
	festival: FestivalWithUserRequests;
};

export type StandReservationWithFestival = ReservationBase & {
	festival: FestivalWithDates;
};

export type StandBase = typeof stands.$inferSelect;

const positionSchema = z.object({
	id: z.number().int().positive(),
	positionLeft: z.number().finite(),
	positionTop: z.number().finite(),
});

export async function updateStandPositions(
	positions: { id: number; positionLeft: number; positionTop: number }[],
): Promise<{ success: boolean; message: string }> {
	try {
		const parsed = z.array(positionSchema).min(1).parse(positions);

		await db.transaction(async (tx) => {
			for (const pos of parsed) {
				await tx
					.update(stands)
					.set({
						positionLeft: pos.positionLeft,
						positionTop: pos.positionTop,
						updatedAt: new Date(),
					})
					.where(eq(stands.id, pos.id));
			}
		});

		revalidatePath("/dashboard/festivals");
		revalidatePath("/", "layout");

		return { success: true, message: "Posiciones actualizadas con éxito" };
	} catch (error) {
		console.error("Error updating stand positions", error);
		return { success: false, message: "Error al actualizar las posiciones" };
	}
}

export async function fetchStandById(
	id: number,
): Promise<StandBase | undefined | null> {
	try {
		return await db.query.stands.findFirst({
			where: eq(stands.id, id),
		});
	} catch (error) {
		console.error("Error fetching stand", error);
		return null;
	}
}

const createStandsSchema = z.object({
	sectorId: z.coerce.number().int().positive(),
	festivalId: z.coerce.number().int().positive(),
	label: z.string().min(1),
	count: z.coerce.number().int().min(1).max(100),
	startNumber: z.coerce.number().int().min(1),
	status: z
		.enum(["available", "reserved", "confirmed", "disabled"])
		.default("disabled"),
	positionLeft: z.number().finite().optional(),
	positionTop: z.number().finite().optional(),
});

export async function createStands(
	input: z.infer<typeof createStandsSchema>,
): Promise<{ success: boolean; message: string; stands: StandBase[] }> {
	try {
		const parsed = createStandsSchema.parse(input);

		const rows = Array.from({ length: parsed.count }, (_, i) => ({
			label: parsed.label,
			standNumber: parsed.startNumber + i,
			status: parsed.status,
			festivalSectorId: parsed.sectorId,
			festivalId: parsed.festivalId,
			positionLeft: parsed.positionLeft ?? 0,
			positionTop: parsed.positionTop ?? 0,
		}));

		const created = await db.insert(stands).values(rows).returning();

		revalidatePath("/dashboard/festivals");
		revalidatePath("/", "layout");

		return {
			success: true,
			message: `${created.length} espacio${created.length !== 1 ? "s" : ""} creado${created.length !== 1 ? "s" : ""}`,
			stands: created,
		};
	} catch (error) {
		console.error("Error creating stands", error);
		return {
			success: false,
			message: "Error al crear los espacios",
			stands: [],
		};
	}
}

const updateStandSchema = z.object({
	id: z.number().int().positive(),
	label: z.string().min(1),
	standNumber: z.coerce.number().int().min(1),
	status: z.enum(["available", "reserved", "confirmed", "disabled"]),
	price: z.number().min(0).optional(),
	standCategory: z
		.enum(["none", "illustration", "gastronomy", "entrepreneurship", "new_artist"])
		.optional(),
});

export async function updateStand(
	input: z.infer<typeof updateStandSchema>,
): Promise<{ success: boolean; message: string; stand?: StandBase }> {
	try {
		const parsed = updateStandSchema.parse(input);

		const setData: Record<string, unknown> = {
			label: parsed.label,
			standNumber: parsed.standNumber,
			status: parsed.status,
			updatedAt: new Date(),
		};
		if (parsed.price !== undefined) setData.price = parsed.price;
		if (parsed.standCategory !== undefined)
			setData.standCategory = parsed.standCategory;

		const [updated] = await db
			.update(stands)
			.set(setData)
			.where(eq(stands.id, parsed.id))
			.returning();

		if (!updated) {
			return { success: false, message: "Espacio no encontrado" };
		}

		revalidatePath("/dashboard/festivals");
		revalidatePath("/", "layout");

		return {
			success: true,
			message: "Espacio actualizado con éxito",
			stand: updated,
		};
	} catch (error) {
		console.error("Error updating stand", error);
		return { success: false, message: "Error al actualizar el espacio" };
	}
}

const deleteStandsSchema = z.array(z.number().int().positive()).min(1);

export async function deleteStands(
	standIds: number[],
): Promise<{ success: boolean; message: string }> {
	try {
		const parsed = deleteStandsSchema.parse(standIds);

		const result = await db.transaction(async (tx) => {
			const reservations = await tx
				.select({ standId: standReservations.standId })
				.from(standReservations)
				.where(inArray(standReservations.standId, parsed))
				.limit(1);

			if (reservations.length > 0) {
				return {
					success: false as const,
					message: "No se pueden eliminar espacios con reservaciones",
				};
			}

			await tx.delete(stands).where(inArray(stands.id, parsed));
			return { success: true as const };
		});

		if (!result.success) {
			return { success: false, message: result.message };
		}

		revalidatePath("/dashboard/festivals");
		revalidatePath("/", "layout");

		const count = parsed.length;
		return {
			success: true,
			message: `${count} espacio${count !== 1 ? "s" : ""} eliminado${count !== 1 ? "s" : ""}`,
		};
	} catch (error) {
		console.error("Error deleting stands", error);
		return { success: false, message: "Error al eliminar los espacios" };
	}
}
