"use server";

import { db } from "@/db";
import { mapElements } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MapElementBase } from "./definitions";

const mapElementTypeValues = [
	"entrance",
	"stage",
	"door",
	"bathroom",
	"label",
	"custom",
	"stairs",
] as const;

const mapElementLabelPositionValues = ["left", "right", "top", "bottom"] as const;

const createMapElementSchema = z.object({
	type: z.enum(mapElementTypeValues),
	label: z.string().nullable().optional(),
	labelPosition: z.enum(mapElementLabelPositionValues).optional(),
	labelFontSize: z.number().positive().optional(),
	labelFontWeight: z.number().min(100).max(900).optional(),
	showIcon: z.boolean().optional(),
	rotation: z.number().finite().optional(),
	positionLeft: z.number().finite(),
	positionTop: z.number().finite(),
	width: z.number().positive(),
	height: z.number().positive(),
	festivalSectorId: z.number().int().positive(),
});

export async function createMapElement(
	input: z.infer<typeof createMapElementSchema>,
): Promise<{
	success: boolean;
	message: string;
	element?: MapElementBase;
}> {
	try {
		const parsed = createMapElementSchema.parse(input);

		const [created] = await db
			.insert(mapElements)
			.values({
				type: parsed.type,
				label: parsed.label ?? null,
				labelPosition: parsed.labelPosition ?? "bottom",
				labelFontSize: parsed.labelFontSize ?? 2,
				labelFontWeight: parsed.labelFontWeight ?? 500,
				showIcon: parsed.showIcon ?? true,
				rotation: parsed.rotation ?? 0,
				positionLeft: parsed.positionLeft,
				positionTop: parsed.positionTop,
				width: parsed.width,
				height: parsed.height,
				festivalSectorId: parsed.festivalSectorId,
			})
			.returning();

		revalidatePath("/dashboard/festivals");
		revalidatePath("/", "layout");

		return {
			success: true,
			message: "Elemento creado con éxito",
			element: created,
		};
	} catch (error) {
		console.error("Error creating map element", error);
		return { success: false, message: "Error al crear el elemento" };
	}
}

const positionSchema = z.object({
	id: z.number().int().positive(),
	positionLeft: z.number().finite(),
	positionTop: z.number().finite(),
});

export async function updateMapElementPositions(
	positions: { id: number; positionLeft: number; positionTop: number }[],
): Promise<{ success: boolean; message: string }> {
	try {
		const parsed = z.array(positionSchema).min(1).parse(positions);

		await db.transaction(async (tx) => {
			for (const pos of parsed) {
				await tx
					.update(mapElements)
					.set({
						positionLeft: pos.positionLeft,
						positionTop: pos.positionTop,
						updatedAt: new Date(),
					})
					.where(eq(mapElements.id, pos.id));
			}
		});

		revalidatePath("/dashboard/festivals");
		revalidatePath("/", "layout");

		return { success: true, message: "Posiciones actualizadas con éxito" };
	} catch (error) {
		console.error("Error updating map element positions", error);
		return { success: false, message: "Error al actualizar las posiciones" };
	}
}

const updateMapElementSchema = z.object({
	id: z.number().int().positive(),
	type: z.enum(mapElementTypeValues).optional(),
	label: z.string().nullable().optional(),
	labelPosition: z.enum(mapElementLabelPositionValues).optional(),
	labelFontSize: z.number().positive().optional(),
	labelFontWeight: z.number().min(100).max(900).optional(),
	showIcon: z.boolean().optional(),
	rotation: z.number().finite().optional(),
	width: z.number().positive().optional(),
	height: z.number().positive().optional(),
});

export async function updateMapElement(
	input: z.infer<typeof updateMapElementSchema>,
): Promise<{
	success: boolean;
	message: string;
	element?: MapElementBase;
}> {
	try {
		const parsed = updateMapElementSchema.parse(input);

		const setData: Record<string, unknown> = { updatedAt: new Date() };
		if (parsed.type !== undefined) setData.type = parsed.type;
		if (parsed.label !== undefined) setData.label = parsed.label;
		if (parsed.labelPosition !== undefined)
			setData.labelPosition = parsed.labelPosition;
		if (parsed.labelFontSize !== undefined)
			setData.labelFontSize = parsed.labelFontSize;
		if (parsed.labelFontWeight !== undefined)
			setData.labelFontWeight = parsed.labelFontWeight;
		if (parsed.showIcon !== undefined) setData.showIcon = parsed.showIcon;
		if (parsed.rotation !== undefined) setData.rotation = parsed.rotation;
		if (parsed.width !== undefined) setData.width = parsed.width;
		if (parsed.height !== undefined) setData.height = parsed.height;

		const [updated] = await db
			.update(mapElements)
			.set(setData)
			.where(eq(mapElements.id, parsed.id))
			.returning();

		if (!updated) {
			return { success: false, message: "Elemento no encontrado" };
		}

		revalidatePath("/dashboard/festivals");
		revalidatePath("/", "layout");

		return {
			success: true,
			message: "Elemento actualizado con éxito",
			element: updated,
		};
	} catch (error) {
		console.error("Error updating map element", error);
		return { success: false, message: "Error al actualizar el elemento" };
	}
}

const deleteMapElementsSchema = z.array(z.number().int().positive()).min(1);

export async function deleteMapElements(
	ids: number[],
): Promise<{ success: boolean; message: string }> {
	try {
		const parsed = deleteMapElementsSchema.parse(ids);

		await db.delete(mapElements).where(inArray(mapElements.id, parsed));

		revalidatePath("/dashboard/festivals");
		revalidatePath("/", "layout");

		const count = parsed.length;
		return {
			success: true,
			message: `${count} elemento${count !== 1 ? "s" : ""} eliminado${count !== 1 ? "s" : ""}`,
		};
	} catch (error) {
		console.error("Error deleting map elements", error);
		return { success: false, message: "Error al eliminar los elementos" };
	}
}
