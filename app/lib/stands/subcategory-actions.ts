"use server";

import { Subcategory } from "@/app/lib/subcategories/definitions";
import { db } from "@/db";
import {
	festivalSectors,
	standSubcategories,
	stands,
	subcategories,
} from "@/db/schema";
import { and, eq, inArray, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type StandWithSubcategories = {
	id: number;
	label: string | null;
	standNumber: number;
	standCategory: (typeof stands.$inferSelect)["standCategory"];
	festivalSectorId: number | null;
	standSubcategories: {
		id: number;
		subcategoryId: number;
		subcategory: Subcategory;
	}[];
};

export type SectorWithStandsAndSubcategories = {
	id: number;
	name: string;
	stands: StandWithSubcategories[];
};

export async function fetchFestivalSectorsForSubcategoryEditor(
	festivalId: number,
): Promise<SectorWithStandsAndSubcategories[]> {
	try {
		const sectors = await db.query.festivalSectors.findMany({
			where: eq(festivalSectors.festivalId, festivalId),
			orderBy: festivalSectors.orderInFestival,
			with: {
				stands: {
					with: {
						standSubcategories: {
							with: { subcategory: true },
						},
					},
					orderBy: stands.standNumber,
				},
			},
		});

		return sectors.map((sector) => ({
			id: sector.id,
			name: sector.name,
			stands: sector.stands
				.map((stand) => ({
					id: stand.id,
					label: stand.label,
					standNumber: stand.standNumber,
					standCategory: stand.standCategory,
					festivalSectorId: stand.festivalSectorId,
					standSubcategories: stand.standSubcategories,
				}))
				.sort(
					(a, b) =>
						a.standCategory.localeCompare(b.standCategory) ||
						a.standNumber - b.standNumber,
				),
		}));
	} catch (error) {
		console.error("Error fetching sectors for subcategory editor", error);
		return [];
	}
}

export async function addStandSubcategory(
	standId: number,
	subcategoryId: number,
	festivalId: number,
): Promise<{ success: boolean; message: string }> {
	try {
		const existing = await db.query.standSubcategories.findFirst({
			where: and(
				eq(standSubcategories.standId, standId),
				eq(standSubcategories.subcategoryId, subcategoryId),
			),
		});

		if (existing) {
			return { success: true, message: "Ya asignada" };
		}

		await db.insert(standSubcategories).values({ standId, subcategoryId });
	} catch (error) {
		console.error("Error adding stand subcategory", error);
		return { success: false, message: "Error al agregar la subcategoría" };
	}

	revalidatePath(`/dashboard/festivals/${festivalId}/stands/subcategories`);
	return { success: true, message: "Subcategoría asignada" };
}

export async function removeStandSubcategory(
	standId: number,
	subcategoryId: number,
	festivalId: number,
): Promise<{ success: boolean; message: string }> {
	try {
		await db
			.delete(standSubcategories)
			.where(
				and(
					eq(standSubcategories.standId, standId),
					eq(standSubcategories.subcategoryId, subcategoryId),
				),
			);
	} catch (error) {
		console.error("Error removing stand subcategory", error);
		return { success: false, message: "Error al quitar la subcategoría" };
	}

	revalidatePath(`/dashboard/festivals/${festivalId}/stands/subcategories`);
	return { success: true, message: "Subcategoría removida" };
}

export async function setStandSubcategoriesBulk(
	standIds: number[],
	subcategoryIds: number[],
	festivalId: number,
): Promise<{ success: boolean; message: string }> {
	if (standIds.length === 0) {
		return { success: false, message: "No se seleccionaron stands" };
	}

	try {
		await db.transaction(async (tx) => {
			await tx
				.delete(standSubcategories)
				.where(inArray(standSubcategories.standId, standIds));

			if (subcategoryIds.length > 0) {
				await tx.insert(standSubcategories).values(
					standIds.flatMap((standId) =>
						subcategoryIds.map((subcategoryId) => ({
							standId,
							subcategoryId,
						})),
					),
				);
			}
		});
	} catch (error) {
		console.error("Error setting stand subcategories in bulk", error);
		return { success: false, message: "Error al actualizar las subcategorías" };
	}

	revalidatePath(`/dashboard/festivals/${festivalId}/stands/subcategories`);
	return { success: true, message: "Subcategorías actualizadas" };
}

export async function fetchAllSubcategories(): Promise<Subcategory[]> {
	try {
		return await db.query.subcategories.findMany({
			orderBy: [asc(subcategories.category), asc(subcategories.label)],
		});
	} catch (error) {
		console.error("Error fetching subcategories", error);
		return [];
	}
}
