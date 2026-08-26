"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { isDeleteBlocked } from "@/app/lib/categories/delete";
import type { ManagementArea } from "@/app/lib/categories/definitions";
import {
  categoryEditorSchema,
  reorderCategoriesSchema,
} from "@/app/lib/categories/schema";
import {
  fetchAdminCategory,
  loadCategoryWithCounts,
} from "@/app/lib/categories/queries";
import { formatDeleteBlockedMessage } from "@/app/lib/categories/copy";
import { blocksToSanitizedHtml } from "@/app/lib/rich-text/render";
import { deleteFile } from "@/app/lib/uploadthing/actions";
import { requireAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { subcategories } from "@/db/schema";

function revalidateCategoryPaths() {
  revalidatePath("/festivals/categories");
  revalidatePath("/dashboard/categories");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
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
      ? await blocksToSanitizedHtml(data.descriptionJson, "compact")
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
        message: "Ya existe una categoría con ese nombre en esta área",
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
      ? await blocksToSanitizedHtml(data.descriptionJson, "compact")
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
        visibility: data.visibility,
        isExclusive: data.isExclusive,
        isAdminAssignableOnly: data.isAdminAssignableOnly,
        sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(subcategories.id, id));

    const previousImage = existing.imageUrl;
    const nextImage = data.imageUrl || null;
    if (previousImage && previousImage !== nextImage) {
      await deleteFile(previousImage);
    }

    revalidateCategoryPaths();
    return {
      success: true as const,
      message: "Categoría actualizada correctamente",
    };
  } catch (error) {
    console.error("Error updating category", error);
    if (isUniqueViolation(error)) {
      return {
        success: false as const,
        message: "Ya existe una categoría con ese nombre en esta área",
      };
    }
    return {
      success: false as const,
      message: "Error al actualizar la categoría",
    };
  }
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

  try {
    const result = await db.transaction(async (tx) => {
      const current = await loadCategoryWithCounts(id, tx);
      if (!current) {
        return { success: false as const, message: "La categoría no existe" };
      }

      if (isDeleteBlocked(current)) {
        return {
          success: false as const,
          blocked: true as const,
          message: formatDeleteBlockedMessage(
            current.label,
            current.verified,
            current.stands,
          ),
        };
      }

      await tx.delete(subcategories).where(eq(subcategories.id, id));
      return {
        success: true as const,
        imageUrl: current.imageUrl,
        label: current.label,
      };
    });

    if (!result.success) {
      return result;
    }

    if (result.imageUrl) {
      await deleteFile(result.imageUrl);
    }

    revalidateCategoryPaths();
    return {
      success: true as const,
      message: `Se eliminó ${result.label}`,
    };
  } catch (error) {
    console.error("Error deleting category", error);
    return { success: false as const, message: "Error al eliminar la categoría" };
  }
}
