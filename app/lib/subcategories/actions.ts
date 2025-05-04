"use server";

import {
  NewSubcategory,
  Subcategory,
} from "@/app/lib/subcategories/definitions";
import { db } from "@/db";
import { subcategories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cache } from "react";

export const fetchSubcategories = cache(async (): Promise<Subcategory[]> => {
	try {
		return await db.query.subcategories.findMany();
	} catch (error) {
		console.error("Error fetching subcategories", error);
		return [];
	}
});

export async function createSubcategory(subcategory: NewSubcategory) {
	try {
		let category = subcategory.category;
		if (subcategory.category === "new_artist") {
			category = "illustration";
		}

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
	return {
		success: true,
		message: "Subcategoría eliminada correctamente",
	};
}
