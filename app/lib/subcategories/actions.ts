"use server";

import {
	NewSubcategory,
	Subcategory,
} from "@/app/lib/subcategories/definitions";
import { db } from "@/db";
import { subcategories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cacheLife, cacheTag, revalidatePath, updateTag } from "next/cache";
import { cache } from "react";

export const fetchSubcategories = cache(async (): Promise<Subcategory[]> => {
	"use cache";
	cacheLife("hours");
	cacheTag("subcategories");

	try {
		return await db.query.subcategories.findMany();
	} catch (error) {
		console.error("Error fetching subcategories", error);
		return [];
	}
});

export async function createSubcategory(subcategory: NewSubcategory) {
	try {
		if (subcategory.category === "none") {
			throw new Error("Subcategoría inválida");
		}

		await db.insert(subcategories).values(subcategory);
	} catch (error) {
		console.error("Error creating subcategory", error);
		return {
			success: false,
			message: "Error al crear la subcategoría",
		};
	}

	revalidatePath("/dashboard/subcategories");
	updateTag("subcategories");
	return {
		success: true,
		message: "Subcategoría creada correctamente",
	};
}

export async function deleteSubcategory(subcategoryId: number) {
	try {
		await db.delete(subcategories).where(eq(subcategories.id, subcategoryId));
	} catch (error) {
		console.error("Error deleting subcategory", error);
		return {
			success: false,
			message: "Error al eliminar la subcategoría",
		};
	}

	revalidatePath("/dashboard/subcategories");
	updateTag("subcategories");
	return {
		success: true,
		message: "Subcategoría eliminada correctamente",
	};
}
