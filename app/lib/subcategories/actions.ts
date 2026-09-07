"use server";

import {
  NewSubcategory,
  Subcategory,
} from "@/app/lib/subcategories/definitions";
import { deleteCategory } from "@/app/lib/categories/actions";
import { requireAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { subcategories } from "@/db/schema";
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

function revalidateLegacyPaths() {
  revalidatePath("/dashboard/subcategories");
  revalidatePath("/dashboard/categories");
  revalidatePath("/festivals/categories");
}

export async function createSubcategory(subcategory: NewSubcategory) {
  const profile = await requireAdmin();
  if (!profile) {
    return {
      success: false,
      message: "No autorizado",
    };
  }

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

  revalidateLegacyPaths();
  return {
    success: true,
    message: "Subcategoría creada correctamente",
  };
}

export async function deleteSubcategory(subcategoryId: number) {
  const profile = await requireAdmin();
  if (!profile) {
    return {
      success: false,
      message: "No autorizado",
    };
  }

  const result = await deleteCategory(subcategoryId);
  if (!result.success) {
    return {
      success: false,
      message: result.message,
    };
  }

  revalidateLegacyPaths();
  return {
    success: true,
    message: "Subcategoría eliminada correctamente",
  };
}
