"use server";

import { db } from "@/db";
import {
	festivals,
	festivalSectors,
	mapTemplates,
	stands,
	users,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
	MapTemplate,
	MapTemplateRecord,
	SectorTemplate,
	StandTemplate,
} from "./definitions";
import {
	exportOptionsSchema,
	importOptionsSchema,
	mapTemplateSchema,
} from "./schemas";

// Fetch all templates
export async function fetchMapTemplates(): Promise<MapTemplateRecord[]> {
	try {
		const results = await db.query.mapTemplates.findMany({
			orderBy: (mapTemplates, { desc }) => [desc(mapTemplates.createdAt)],
		});

		return results.map((r) => ({
			...r,
			templateData: r.templateData as MapTemplate,
		}));
	} catch (error) {
		console.error("Error fetching map templates", error);
		return [];
	}
}

// Fetch single template by ID
export async function fetchMapTemplateById(
	templateId: number,
): Promise<MapTemplateRecord | null> {
	try {
		const result = await db.query.mapTemplates.findFirst({
			where: eq(mapTemplates.id, templateId),
		});

		if (!result) return null;

		return {
			...result,
			templateData: result.templateData as MapTemplate,
		};
	} catch (error) {
		console.error("Error fetching map template", error);
		return null;
	}
}

// Export festival map as template
export async function exportFestivalMapAsTemplate(
	festivalId: number,
	options?: z.infer<typeof exportOptionsSchema>,
): Promise<{ success: boolean; template?: MapTemplate; message: string }> {
	try {
		const parsedOptions = options ? exportOptionsSchema.parse(options) : {};

		// Fetch festival info
		const festival = await db.query.festivals.findFirst({
			where: eq(festivals.id, festivalId),
		});

		if (!festival) {
			return { success: false, message: "Festival no encontrado" };
		}

		// Fetch sectors with stands
		const sectorsQuery = db.query.festivalSectors.findMany({
			where: eq(festivalSectors.festivalId, festivalId),
			with: {
				stands: true,
			},
			orderBy: festivalSectors.orderInFestival,
		});

		const sectors = await sectorsQuery;

		// Filter sectors if sectorIds provided
		const filteredSectors = parsedOptions.sectorIds
			? sectors.filter((s) => parsedOptions.sectorIds!.includes(s.id))
			: sectors;

		if (filteredSectors.length === 0) {
			return { success: false, message: "No se encontraron sectores" };
		}

		// Build template
		const sectorTemplates: SectorTemplate[] = filteredSectors.map((sector) => ({
			name: sector.name,
			description: sector.description,
			orderInFestival: sector.orderInFestival,
			mapBounds: {
				originX: sector.mapOriginX,
				originY: sector.mapOriginY,
				width: sector.mapWidth,
				height: sector.mapHeight,
			},
			stands: sector.stands.map(
				(stand): StandTemplate => ({
					label: stand.label,
					standNumber: stand.standNumber,
					standCategory: stand.standCategory,
					zone: stand.zone,
					orientation: stand.orientation,
					width: stand.width,
					height: stand.height,
					positionLeft: stand.positionLeft ?? 0,
					positionTop: stand.positionTop ?? 0,
					price: stand.price,
				}),
			),
		}));

		const template: MapTemplate = {
			version: "1.0",
			metadata: {
				name: `${festival.name} - Plantilla`,
				createdAt: new Date().toISOString(),
				createdFrom: {
					festivalId: festival.id,
					festivalName: festival.name,
				},
			},
			sectors: sectorTemplates,
		};

		return {
			success: true,
			template,
			message: "Plantilla exportada correctamente",
		};
	} catch (error) {
		console.error("Error exporting festival map", error);
		return { success: false, message: "Error al exportar el mapa" };
	}
}

// Export single sector as template
export async function exportSectorAsTemplate(
	sectorId: number,
): Promise<{ success: boolean; template?: MapTemplate; message: string }> {
	try {
		const sector = await db.query.festivalSectors.findFirst({
			where: eq(festivalSectors.id, sectorId),
			with: {
				stands: true,
				festival: true,
			},
		});

		if (!sector) {
			return { success: false, message: "Sector no encontrado" };
		}

		const sectorTemplate: SectorTemplate = {
			name: sector.name,
			description: sector.description,
			orderInFestival: sector.orderInFestival,
			mapBounds: {
				originX: sector.mapOriginX,
				originY: sector.mapOriginY,
				width: sector.mapWidth,
				height: sector.mapHeight,
			},
			stands: sector.stands.map(
				(stand): StandTemplate => ({
					label: stand.label,
					standNumber: stand.standNumber,
					standCategory: stand.standCategory,
					zone: stand.zone,
					orientation: stand.orientation,
					width: stand.width,
					height: stand.height,
					positionLeft: stand.positionLeft ?? 0,
					positionTop: stand.positionTop ?? 0,
					price: stand.price,
				}),
			),
		};

		const template: MapTemplate = {
			version: "1.0",
			metadata: {
				name: `${sector.name} - Plantilla`,
				createdAt: new Date().toISOString(),
				createdFrom: sector.festival
					? {
							festivalId: sector.festival.id,
							festivalName: sector.festival.name,
						}
					: undefined,
			},
			sectors: [sectorTemplate],
		};

		return {
			success: true,
			template,
			message: "Sector exportado correctamente",
		};
	} catch (error) {
		console.error("Error exporting sector", error);
		return { success: false, message: "Error al exportar el sector" };
	}
}

// Save template to database
export async function saveMapTemplate(
	template: MapTemplate,
	clerkId: string,
	festivalId?: number,
): Promise<{ success: boolean; templateId?: number; message: string }> {
	try {
		// Validate template structure
		mapTemplateSchema.parse(template);

		// Look up user by clerkId
		const user = await db.query.users.findFirst({
			where: eq(users.clerkId, clerkId),
		});

		const [created] = await db
			.insert(mapTemplates)
			.values({
				name: template.metadata.name,
				description: template.metadata.description ?? null,
				templateData: template,
				createdByUserId: user?.id ?? null,
				createdFromFestivalId: festivalId ?? null,
			})
			.returning();

		return {
			success: true,
			templateId: created.id,
			message: "Plantilla guardada correctamente",
		};
	} catch (error) {
		console.error("Error saving map template", error);
		if (error instanceof z.ZodError) {
			return { success: false, message: "Estructura de plantilla inválida" };
		}
		return { success: false, message: "Error al guardar la plantilla" };
	}
}

// Delete template
export async function deleteMapTemplate(
	templateId: number,
): Promise<{ success: boolean; message: string }> {
	try {
		await db.delete(mapTemplates).where(eq(mapTemplates.id, templateId));

		return { success: true, message: "Plantilla eliminada correctamente" };
	} catch (error) {
		console.error("Error deleting map template", error);
		return { success: false, message: "Error al eliminar la plantilla" };
	}
}

// Import template to festival
export async function importTemplateToFestival(
	festivalId: number,
	template: MapTemplate,
	options: z.infer<typeof importOptionsSchema>,
): Promise<{ success: boolean; message: string; createdStands?: number }> {
	try {
		// Validate inputs
		mapTemplateSchema.parse(template);
		const parsedOptions = importOptionsSchema.parse(options);

		// Fetch target festival's sectors
		const targetSectors = await db.query.festivalSectors.findMany({
			where: eq(festivalSectors.festivalId, festivalId),
			with: {
				stands: {
					with: {
						reservations: true,
					},
				},
			},
			orderBy: festivalSectors.orderInFestival,
		});

		// If importing to a specific sector
		if (parsedOptions.targetSectorId) {
			const targetSector = targetSectors.find(
				(s) => s.id === parsedOptions.targetSectorId,
			);
			if (!targetSector) {
				return { success: false, message: "Sector destino no encontrado" };
			}

			// Check for existing stands
			if (targetSector.stands.length > 0) {
				if (parsedOptions.mode === "create_only") {
					return {
						success: false,
						message: "El sector ya tiene espacios configurados",
					};
				}

				// Check for reservations before replacing
				const hasReservations = targetSector.stands.some(
					(s) => s.reservations && s.reservations.length > 0,
				);
				if (hasReservations) {
					return {
						success: false,
						message:
							"No se puede reemplazar: algunos espacios tienen reservaciones activas",
					};
				}
			}

			// Use first sector from template for single sector import
			const templateSector = template.sectors[0];
			if (!templateSector) {
				return {
					success: false,
					message: "La plantilla no tiene sectores",
				};
			}

			return await db.transaction(async (tx) => {
				// Delete existing stands if replace mode
				if (
					parsedOptions.mode === "replace" &&
					targetSector.stands.length > 0
				) {
					await tx
						.delete(stands)
						.where(eq(stands.festivalSectorId, targetSector.id));
				}

				// Update sector bounds
				await tx
					.update(festivalSectors)
					.set({
						mapOriginX: templateSector.mapBounds.originX,
						mapOriginY: templateSector.mapBounds.originY,
						mapWidth: templateSector.mapBounds.width,
						mapHeight: templateSector.mapBounds.height,
						updatedAt: new Date(),
					})
					.where(eq(festivalSectors.id, targetSector.id));

				// Create stands
				if (templateSector.stands.length > 0) {
					await tx.insert(stands).values(
						templateSector.stands.map((stand) => ({
							label: stand.label,
							standNumber: stand.standNumber,
							standCategory: stand.standCategory,
							zone: stand.zone,
							orientation: stand.orientation,
							width: stand.width,
							height: stand.height,
							positionLeft: stand.positionLeft,
							positionTop: stand.positionTop,
							price: stand.price,
							status: "available" as const,
							festivalId,
							festivalSectorId: targetSector.id,
						})),
					);
				}

				revalidatePath("/dashboard/festivals");
				revalidatePath("/", "layout");

				return {
					success: true,
					message: `Plantilla importada: ${templateSector.stands.length} espacios creados`,
					createdStands: templateSector.stands.length,
				};
			});
		}

		// Full festival import - reconcile sectors to match template
		const allExistingStands = targetSectors.flatMap((s) => s.stands);
		if (allExistingStands.length > 0) {
			if (parsedOptions.mode === "create_only") {
				return {
					success: false,
					message: "El festival ya tiene espacios configurados",
				};
			}

			// Check for reservations before replacing
			const hasReservations = allExistingStands.some(
				(s) => s.reservations && s.reservations.length > 0,
			);
			if (hasReservations) {
				return {
					success: false,
					message:
						"No se puede reemplazar: algunos espacios tienen reservaciones activas",
				};
			}
		}

		return await db.transaction(async (tx) => {
			let totalCreated = 0;

			// 1. Delete all existing stands across all sectors
			if (allExistingStands.length > 0) {
				const standIds = allExistingStands.map((s) => s.id);
				await tx.delete(stands).where(inArray(stands.id, standIds));
			}

			// 2. Delete extra sectors if festival has more than template
			if (targetSectors.length > template.sectors.length) {
				const extraSectorIds = targetSectors
					.slice(template.sectors.length)
					.map((s) => s.id);
				// Stands already deleted above, safe to delete sectors
				await tx
					.delete(festivalSectors)
					.where(inArray(festivalSectors.id, extraSectorIds));
			}

			// 3. Update existing sectors and create new ones as needed
			const sectorIds: number[] = [];

			for (let i = 0; i < template.sectors.length; i++) {
				const templateSector = template.sectors[i];

				if (i < targetSectors.length) {
					// Update existing sector
					const targetSector = targetSectors[i];
					await tx
						.update(festivalSectors)
						.set({
							name: templateSector.name,
							description: templateSector.description,
							orderInFestival: templateSector.orderInFestival,
							mapOriginX: templateSector.mapBounds.originX,
							mapOriginY: templateSector.mapBounds.originY,
							mapWidth: templateSector.mapBounds.width,
							mapHeight: templateSector.mapBounds.height,
							updatedAt: new Date(),
						})
						.where(eq(festivalSectors.id, targetSector.id));
					sectorIds.push(targetSector.id);
				} else {
					// Create new sector
					const [newSector] = await tx
						.insert(festivalSectors)
						.values({
							festivalId,
							name: templateSector.name,
							description: templateSector.description,
							orderInFestival: templateSector.orderInFestival,
							mapOriginX: templateSector.mapBounds.originX,
							mapOriginY: templateSector.mapBounds.originY,
							mapWidth: templateSector.mapBounds.width,
							mapHeight: templateSector.mapBounds.height,
						})
						.returning();
					sectorIds.push(newSector.id);
				}
			}

			// 4. Create stands for each sector
			for (let i = 0; i < template.sectors.length; i++) {
				const templateSector = template.sectors[i];
				const sectorId = sectorIds[i];

				if (templateSector.stands.length > 0) {
					await tx.insert(stands).values(
						templateSector.stands.map((stand) => ({
							label: stand.label,
							standNumber: stand.standNumber,
							standCategory: stand.standCategory,
							zone: stand.zone,
							orientation: stand.orientation,
							width: stand.width,
							height: stand.height,
							positionLeft: stand.positionLeft,
							positionTop: stand.positionTop,
							price: stand.price,
							status: "available" as const,
							festivalId,
							festivalSectorId: sectorId,
						})),
					);
					totalCreated += templateSector.stands.length;
				}
			}

			revalidatePath("/dashboard/festivals");
			revalidatePath("/", "layout");

			return {
				success: true,
				message: `Plantilla importada: ${totalCreated} espacios creados en ${template.sectors.length} sectores`,
				createdStands: totalCreated,
			};
		});
	} catch (error) {
		console.error("Error importing template", error);
		if (error instanceof z.ZodError) {
			return { success: false, message: "Estructura de plantilla inválida" };
		}
		return { success: false, message: "Error al importar la plantilla" };
	}
}

// Update template metadata
export async function updateMapTemplate(
	templateId: number,
	data: { name?: string; description?: string },
): Promise<{ success: boolean; message: string }> {
	try {
		const updateData: { name?: string; description?: string; updatedAt: Date } =
			{
				updatedAt: new Date(),
			};

		if (data.name) updateData.name = data.name;
		if (data.description !== undefined)
			updateData.description = data.description;

		await db
			.update(mapTemplates)
			.set(updateData)
			.where(eq(mapTemplates.id, templateId));

		return { success: true, message: "Plantilla actualizada correctamente" };
	} catch (error) {
		console.error("Error updating map template", error);
		return { success: false, message: "Error al actualizar la plantilla" };
	}
}
