"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { deleteCategoryRecord } from "@/app/lib/categories/delete-persist";
import type { ManagementArea } from "@/app/lib/categories/definitions";
import {
  categoryEditorSchema,
  reorderCategoriesSchema,
} from "@/app/lib/categories/schema";
import { fetchAdminCategory } from "@/app/lib/categories/queries";
import { UNIQUE_LABEL_MESSAGE } from "@/app/lib/categories/copy";
import { isUniqueViolation } from "@/app/lib/categories/pg";
import { blocksToSanitizedHtml } from "@/app/lib/rich-text/render";
import { deleteFile } from "@/app/lib/uploadthing/actions";
import { requireAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { subcategories } from "@/db/schema";

function revalidateCategoryPaths() {
  revalidatePath("/festivals/categories");
  revalidatePath("/dashboard/categories");
}

async function cleanupCategoryImage(url: string, fileKey?: string | null) {
  try {
    const result = await deleteFile(url, fileKey);
    if (!result.success) {
      console.error("Failed to delete category image from storage", {
        url,
        fileKey,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Failed to delete category image from storage", error);
  }
}

async function nextSortOrder(area: ManagementArea): Promise<number> {
  const [row] = await db
    .select({
      max: sql<number>`coalesce(max(${subcategories.sortOrder}), -1)`.mapWith(
        Number,
      ),
    })
    .from(subcategories)
    .where(eq(subcategories.category, area));
  return (row?.max ?? -1) + 1;
}

export async function createCategory(input: unknown) {
  const profile = await requireAdmin();
  if (!profile) {
    return { success: false as const, message: "No autorizado" };
  }

  const parsed = categoryEditorSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const data = parsed.data;

  try {
    const descriptionHtml = Array.isArray(data.descriptionJson)
      ? await blocksToSanitizedHtml(
          data.descriptionJson,
          "compact",
          "una categoría",
        )
      : null;
    const sortOrder = await nextSortOrder(data.category);

    const [created] = await db
      .insert(subcategories)
      .values({
        label: data.label,
        category: data.category,
        descriptionJson: data.descriptionJson ?? null,
        descriptionHtml,
        imageUrl: data.imageUrl || null,
        imageFileKey: data.imageFileKey || null,
        visibility: data.visibility,
        isExclusive: data.isExclusive,
        isAdminAssignableOnly: data.isAdminAssignableOnly,
        sortOrder,
      })
      .returning({ id: subcategories.id });

    revalidateCategoryPaths();
    return {
      success: true as const,
      message: "Categoría creada correctamente",
      id: created?.id,
    };
  } catch (error) {
    console.error("Error creating category", error);
    if (isUniqueViolation(error)) {
      return {
        success: false as const,
        message: UNIQUE_LABEL_MESSAGE,
      };
    }
    return { success: false as const, message: "Error al crear la categoría" };
  }
}

export async function updateCategory(id: number, input: unknown) {
  const profile = await requireAdmin();
  if (!profile) {
    return { success: false as const, message: "No autorizado" };
  }

  const parsed = categoryEditorSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const existing = await fetchAdminCategory(id);
  if (!existing) {
    return { success: false as const, message: "La categoría no existe" };
  }

  const data = parsed.data;

  try {
    const descriptionHtml = Array.isArray(data.descriptionJson)
      ? await blocksToSanitizedHtml(
          data.descriptionJson,
          "compact",
          "una categoría",
        )
      : null;

    const movingArea = existing.category !== data.category;
    const sortOrder = movingArea
      ? await nextSortOrder(data.category)
      : existing.sortOrder;

    await db
      .update(subcategories)
      .set({
        label: data.label,
        category: data.category,
        descriptionJson: data.descriptionJson ?? null,
        descriptionHtml,
        imageUrl: data.imageUrl || null,
        imageFileKey: data.imageFileKey || null,
        visibility: data.visibility,
        isExclusive: data.isExclusive,
        isAdminAssignableOnly: data.isAdminAssignableOnly,
        sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(subcategories.id, id));
  } catch (error) {
    console.error("Error updating category", error);
    if (isUniqueViolation(error)) {
      return {
        success: false as const,
        message: UNIQUE_LABEL_MESSAGE,
      };
    }
    return {
      success: false as const,
      message: "Error al actualizar la categoría",
    };
  }

  const previousImage = existing.imageUrl;
  const previousKey = existing.imageFileKey;
  const nextImage = data.imageUrl || null;
  if (previousImage && previousImage !== nextImage) {
    await cleanupCategoryImage(previousImage, previousKey);
  }

  revalidateCategoryPaths();
  return {
    success: true as const,
    message: "Categoría actualizada correctamente",
  };
}

export async function setCategoryVisibility(
  id: number,
  visibility: "hidden" | "listed" | "selectable",
) {
  const profile = await requireAdmin();
  if (!profile) {
    return { success: false as const, message: "No autorizado" };
  }

  try {
    const existing = await fetchAdminCategory(id);
    if (!existing) {
      return { success: false as const, message: "La categoría no existe" };
    }

    await db
      .update(subcategories)
      .set({ visibility, updatedAt: new Date() })
      .where(eq(subcategories.id, id));

    revalidateCategoryPaths();
    return { success: true as const, message: "Visibilidad actualizada" };
  } catch (error) {
    console.error("Error updating category visibility", error);
    return {
      success: false as const,
      message: "Error al actualizar la visibilidad",
    };
  }
}

export async function reorderCategories(input: unknown) {
  const profile = await requireAdmin();
  if (!profile) {
    return { success: false as const, message: "No autorizado" };
  }

  const parsed = reorderCategoriesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, message: "Orden inválido" };
  }

  try {
    await db.transaction(async (tx) => {
      for (const item of parsed.data.items) {
        await tx
          .update(subcategories)
          .set({
            sortOrder: item.sortOrder,
            updatedAt: new Date(),
          })
          .where(eq(subcategories.id, item.id));
      }
    });

    revalidateCategoryPaths();
    return { success: true as const, message: "Orden actualizado" };
  } catch (error) {
    console.error("Error reordering categories", error);
    return { success: false as const, message: "Error al reordenar" };
  }
}

export async function deleteCategory(id: number) {
  const profile = await requireAdmin();
  if (!profile) {
    return { success: false as const, message: "No autorizado" };
  }

  let result;
  try {
    result = await db.transaction(async (tx) => deleteCategoryRecord(tx, id));
  } catch (error) {
    console.error("Error deleting category", error);
    return { success: false as const, message: "Error al eliminar la categoría" };
  }

  if (!result.success) {
    return result;
  }

  if (result.imageUrl || result.imageFileKey) {
    await cleanupCategoryImage(result.imageUrl ?? "", result.imageFileKey);
  }

  revalidateCategoryPaths();
  return {
    success: true as const,
    message: `Se eliminó ${result.label}`,
  };
}
