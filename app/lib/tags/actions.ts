"use server";

import { NewTag, Tag } from "@/app/lib/tags/definitions";
import { db } from "@/db";
import { tags } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function fetchTags(): Promise<Tag[]> {
	try {
		return await db.query.tags.findMany();
	} catch (error) {
		console.error("Error fetching tags", error);
		return [];
	}
}

export async function createTag(tag: NewTag) {
	try {
		let category = tag.category;
		if (tag.category === "new_artist") {
			category = "illustration";
		}

		if (tag.category === "none") {
			throw new Error("Categoría inválida");
		}

		await db.insert(tags).values(tag);
	} catch (error) {
		console.error("Error creating tag", error);
		return {
			success: false,
			message: "Error al crear la etiqueta",
		};
	}

	revalidatePath("/dashboard/tags");
	return {
		success: true,
		message: "Etiqueta creada correctamente",
	};
}

export async function deleteTag(tagId: number) {
	try {
		await db.delete(tags).where(eq(tags.id, tagId));
	} catch (error) {
		console.error("Error deleting tag", error);
		return {
			success: false,
			message: "Error al eliminar la etiqueta",
		};
	}

	revalidatePath("/dashboard/tags");
	return {
		success: true,
		message: "Etiqueta eliminada correctamente",
	};
}
