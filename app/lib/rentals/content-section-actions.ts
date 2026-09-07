"use server";

import { asc, and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  buildRentalContentSectionsSnapshot,
  validateProductContentSection,
} from "@/app/lib/rentals/validation";
import type { ProductContentSectionInput } from "@/app/lib/rentals/types";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { productContentSections, productVariants } from "@/db/schema";

export async function fetchProductContentSections(productId: number) {
  return db.query.productContentSections.findMany({
    where: eq(productContentSections.productId, productId),
    orderBy: [
      asc(productContentSections.sortOrder),
      asc(productContentSections.id),
    ],
  });
}

async function validateSectionVariantScope(
  productId: number,
  productVariantId: number | null | undefined,
): Promise<string | null> {
  if (productVariantId == null) return null;

  const [variant] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.id, productVariantId),
        eq(productVariants.productId, productId),
      ),
    )
    .limit(1);

  if (!variant) {
    return "La variante seleccionada no pertenece a este producto.";
  }

  return null;
}

export async function upsertProductContentSection(
  productId: number,
  payload: ProductContentSectionInput,
) {
  const admin = await getCurrentUserProfile();
  if (!admin || admin.role !== "admin") {
    return { success: false, message: "No autorizado." };
  }

  const validationError = validateProductContentSection(payload);
  if (validationError) {
    return { success: false, message: validationError };
  }

  const variantScopeError = await validateSectionVariantScope(
    productId,
    payload.productVariantId,
  );
  if (variantScopeError) {
    return { success: false, message: variantScopeError };
  }

  if (payload.id) {
    const [existing] = await db
      .select({ productId: productContentSections.productId })
      .from(productContentSections)
      .where(eq(productContentSections.id, payload.id))
      .limit(1);

    if (!existing || existing.productId !== productId) {
      return { success: false, message: "Sección no encontrada." };
    }
  }

  const values = {
    productId,
    productVariantId: payload.productVariantId ?? null,
    title: payload.title.trim(),
    format: payload.format,
    body:
      payload.format === "free_text" ? (payload.body?.trim() ?? null) : null,
    items:
      payload.format === "bullet_list"
        ? (payload.items ?? []).map((item) => item.trim()).filter(Boolean)
        : null,
    displayContext: payload.displayContext,
    isVisible: payload.isVisible ?? true,
    sortOrder: payload.sortOrder ?? 0,
    updatedAt: new Date(),
  };

  if (payload.id) {
    await db
      .update(productContentSections)
      .set(values)
      .where(
        and(
          eq(productContentSections.id, payload.id),
          eq(productContentSections.productId, productId),
        ),
      );
  } else {
    await db.insert(productContentSections).values(values);
  }

  revalidatePath("/dashboard/store/products");
  revalidatePath(`/dashboard/store/products/${productId}/edit`);
  return { success: true, message: "Sección guardada." };
}

export async function deleteProductContentSection(
  sectionId: number,
  productId: number,
) {
  const admin = await getCurrentUserProfile();
  if (!admin || admin.role !== "admin") {
    return { success: false, message: "No autorizado." };
  }

  await db
    .delete(productContentSections)
    .where(
      and(
        eq(productContentSections.id, sectionId),
        eq(productContentSections.productId, productId),
      ),
    );

  revalidatePath("/dashboard/store/products");
  revalidatePath(`/dashboard/store/products/${productId}/edit`);
  return { success: true, message: "Sección eliminada." };
}

export async function reorderProductContentSections(
  productId: number,
  orderedSectionIds: number[],
) {
  const admin = await getCurrentUserProfile();
  if (!admin || admin.role !== "admin") {
    return { success: false, message: "No autorizado." };
  }

  if (orderedSectionIds.length > 0) {
    const ownedSections = await db
      .select({ id: productContentSections.id })
      .from(productContentSections)
      .where(
        and(
          eq(productContentSections.productId, productId),
          inArray(productContentSections.id, orderedSectionIds),
        ),
      );

    if (ownedSections.length !== orderedSectionIds.length) {
      return {
        success: false,
        message: "Una o más secciones no pertenecen a este producto.",
      };
    }
  }

  await db.transaction(async (tx) => {
    for (const [index, sectionId] of orderedSectionIds.entries()) {
      await tx
        .update(productContentSections)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(
          and(
            eq(productContentSections.id, sectionId),
            eq(productContentSections.productId, productId),
          ),
        );
    }
  });

  revalidatePath(`/dashboard/store/products/${productId}/edit`);
  return { success: true, message: "Secciones reordenadas." };
}

export { buildRentalContentSectionsSnapshot };
