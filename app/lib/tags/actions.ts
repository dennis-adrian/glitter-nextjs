"use server";

import { NewTag, Tag } from "@/app/lib/tags/definitions";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
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

/**
 * Staff: /dashboard/tags is linked from the admin menu only, but the page itself
 * admits festival admins too.
 */
export async function createTag(tag: NewTag) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

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

/** Staff, as `createTag`. Deleting a tag removes it from every profile. */
export async function deleteTag(tagId: number) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

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
