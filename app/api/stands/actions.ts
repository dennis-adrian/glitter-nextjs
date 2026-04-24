"use server";

import { ReservationBase } from "@/app/api/reservations/definitions";
import {
	FestivalWithDates,
	FestivalWithUserRequests,
} from "@/app/lib/festivals/definitions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
	reservationParticipants,
	standReservations,
	stands,
	users,
} from "@/db/schema";
import { and, eq, inArray, not } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const standStatusZ = z.enum([
	"available",
	"held",
	"reserved",
	"confirmed",
	"disabled",
]);

const standCategoryZ = z.enum([
	"none",
	"illustration",
	"gastronomy",
	"entrepreneurship",
	"new_artist",
]);

function normalizeStandLabelForCompare(label: string | null | undefined) {
	return label?.trim() ?? "";
}

/** Dashboard-only actions; require festival or global admin. */
async function requireFestivalOrAdmin() {
	const profile = await getCurrentUserProfile();
	if (!profile) {
		return { ok: false as const, message: "Inicia sesión para continuar." };
	}
	if (profile.role !== "festival_admin" && profile.role !== "admin") {
		return {
			ok: false as const,
			message: "No tienes permisos para realizar esta acción.",
		};
	}
	return { ok: true as const, profile };
}

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
		.enum(["available", "held", "reserved", "confirmed", "disabled"])
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
	status: standStatusZ,
	price: z.number().min(0).optional(),
	standCategory: standCategoryZ.optional(),
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

const bulkUpdateStandsSchema = z.object({
	festivalId: z.coerce.number().int().positive(),
	standIds: z.array(z.coerce.number().int().positive()).min(1),
	patch: z
		.object({
			status: standStatusZ.optional(),
			label: z.string().min(1).optional(),
			price: z.coerce.number().min(0).optional(),
			standCategory: standCategoryZ.optional(),
		})
		.refine(
			(p) =>
				p.status !== undefined ||
				p.label !== undefined ||
				p.price !== undefined ||
				p.standCategory !== undefined,
			{ message: "Debes indicar al menos un cambio" },
		),
});

export async function bulkUpdateStands(
	input: z.infer<typeof bulkUpdateStandsSchema>,
): Promise<{ success: boolean; message: string; updatedCount?: number }> {
	const auth = await requireFestivalOrAdmin();
	if (!auth.ok) {
		return { success: false, message: auth.message };
	}
	try {
		const parsed = bulkUpdateStandsSchema.parse(input);
		const { festivalId, standIds, patch } = parsed;

		const uniqueIds = [...new Set(standIds)];

		const setData: Record<string, unknown> = { updatedAt: new Date() };
		if (patch.status !== undefined) setData.status = patch.status;
		if (patch.label !== undefined) setData.label = patch.label;
		if (patch.price !== undefined) setData.price = patch.price;
		if (patch.standCategory !== undefined)
			setData.standCategory = patch.standCategory;

		const result = await db.transaction(async (tx) => {
			const rows = await tx
				.select({ id: stands.id })
				.from(stands)
				.where(
					and(eq(stands.festivalId, festivalId), inArray(stands.id, uniqueIds)),
				)
				.for("update");

			if (rows.length !== uniqueIds.length) {
				return {
					success: false as const,
					message: "Uno o más espacios no pertenecen a este festival.",
				};
			}

			const updated = await tx
				.update(stands)
				.set(setData)
				.where(
					and(eq(stands.festivalId, festivalId), inArray(stands.id, uniqueIds)),
				)
				.returning({ id: stands.id });

			return { success: true as const, updatedCount: updated.length };
		});

		if (!result.success) {
			return { success: false, message: result.message };
		}

		revalidatePath("/dashboard/festivals");
		revalidatePath("/", "layout");

		const n = result.updatedCount;
		return {
			success: true,
			message: `${n} espacio${n !== 1 ? "s" : ""} actualizado${n !== 1 ? "s" : ""}`,
			updatedCount: n,
		};
	} catch (error) {
		console.error("Error in bulkUpdateStands", error);
		return { success: false, message: "Error al actualizar los espacios" };
	}
}

const renumberStandsSequentiallySchema = z.object({
	festivalId: z.coerce.number().int().positive(),
	standIds: z.array(z.coerce.number().int().positive()).min(1),
	startNumber: z.coerce.number().int().min(1),
});

export async function renumberStandsSequentially(
	input: z.infer<typeof renumberStandsSequentiallySchema>,
): Promise<{ success: boolean; message: string }> {
	const auth = await requireFestivalOrAdmin();
	if (!auth.ok) {
		return { success: false, message: auth.message };
	}
	try {
		const parsed = renumberStandsSequentiallySchema.parse(input);
		const { festivalId, standIds, startNumber } = parsed;
		const uniqueIds = [...new Set(standIds)];

		const selectedRows = await db
			.select()
			.from(stands)
			.where(
				and(eq(stands.festivalId, festivalId), inArray(stands.id, uniqueIds)),
			);

		if (selectedRows.length !== uniqueIds.length) {
			return {
				success: false,
				message: "Uno o más espacios no pertenecen a este festival.",
			};
		}

		const sorted = [...selectedRows].sort(
			(a, b) => a.standNumber - b.standNumber || a.id - b.id,
		);

		const newAssignments = sorted.map((row, i) => ({
			id: row.id,
			label: row.label,
			standNumber: startNumber + i,
		}));

		const unselected = await db
			.select()
			.from(stands)
			.where(
				and(
					eq(stands.festivalId, festivalId),
					not(inArray(stands.id, uniqueIds)),
				),
			);

		for (const a of newAssignments) {
			const aLabel = normalizeStandLabelForCompare(a.label);
			for (const u of unselected) {
				if (normalizeStandLabelForCompare(u.label) !== aLabel) continue;
				if (u.standNumber === a.standNumber) {
					return {
						success: false,
						message: `El número ${a.standNumber} ya está en uso para la etiqueta «${aLabel || "(vacía)"}» en otro espacio.`,
					};
				}
			}
		}

		await db.transaction(async (tx) => {
			for (const a of newAssignments) {
				await tx
					.update(stands)
					.set({ standNumber: a.standNumber, updatedAt: new Date() })
					.where(eq(stands.id, a.id));
			}
		});

		revalidatePath("/dashboard/festivals");
		revalidatePath("/", "layout");

		return { success: true, message: "Números de espacio actualizados" };
	} catch (error) {
		console.error("Error in renumberStandsSequentially", error);
		return { success: false, message: "Error al renumerar los espacios" };
	}
}
