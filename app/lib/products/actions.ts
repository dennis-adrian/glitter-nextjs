"use server";

import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm/column";
import type { OrderByOperators } from "drizzle-orm/relations";
import type { SQLWrapper } from "drizzle-orm/sql/sql";
import { revalidatePath } from "next/cache";

import { ensureUniqueSlug, slugifyName } from "@/app/lib/products/slug";
import { getProductEffectiveStock } from "@/app/lib/products/variants";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  cartItems,
  orderItems,
  productImages,
  productOptions,
  productOptionValues,
  products,
  productVariantOptionValues,
  productVariants,
} from "@/db/schema";

type ProductVariantInput = {
  id?: number;
  optionValues: string[];
  price?: number | null;
  stock: number;
  imageUrl?: string | null;
  isVisible?: boolean;
  sortOrder?: number;
};

type ProductOptionInput = {
  id?: number;
  name: string;
  selectorDisplay?: "dropdown" | "image" | "button";
  values: {
    id?: number;
    value: string;
    sortOrder?: number;
  }[];
  sortOrder?: number;
};

type NewProductData = {
  name: string;
  description?: string | null;
  price: number;
  stock?: number | null;
  status?: "available" | "presale" | "sale";
  discount?: number | null;
  discountUnit?: "percentage" | "amount";
  availableDate?: Date | string | null;
  isFeatured?: boolean;
  isNew?: boolean;
  isVisible?: boolean;
  imagePayloads?: { id: number; isMain: boolean }[];
  variantOptions?: ProductOptionInput[];
  variants?: ProductVariantInput[];
};

export type LowStockEntry = {
  productId: number;
  productName: string;
  variantId: number | null;
  variantLabel: string | null;
  stock: number;
};

type ProductTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function normalizeAvailableDate(
  date: Date | string | null | undefined,
): Date | null | undefined {
  if (date === null || date === undefined) return date;
  const d =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(`${date}T12:00:00.000Z`)
      : new Date(date);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

function getOptionValueKey(value: string): string {
  return value.trim().toLowerCase();
}

function getVariantCombinationKey(optionValues: string[]): string {
  return optionValues.map(getOptionValueKey).join("\u001f");
}

function normalizeVariantInputs(
  options: ProductOptionInput[] | undefined,
  variants: ProductVariantInput[] | undefined,
): {
  options: ProductOptionInput[];
  variants: ProductVariantInput[];
} {
  const normalizedOptions = (options ?? [])
    .map((option, optionIndex) => {
      const selectorDisplay: "dropdown" | "image" | "button" =
        option.selectorDisplay === "image" ||
        option.selectorDisplay === "button"
          ? option.selectorDisplay
          : "dropdown";
      const seenValues = new Set<string>();
      const values = option.values
        .map((value, valueIndex) => ({
          ...value,
          value: value.value.trim(),
          sortOrder: value.sortOrder ?? valueIndex,
        }))
        .filter((value) => {
          if (!value.value) return false;
          const key = getOptionValueKey(value.value);
          if (seenValues.has(key)) return false;
          seenValues.add(key);
          return true;
        });

      return {
        ...option,
        name: option.name.trim(),
        selectorDisplay,
        sortOrder: option.sortOrder ?? optionIndex,
        values,
      };
    })
    .filter((option) => option.name.length > 0 && option.values.length > 0);

  const optionCount = normalizedOptions.length;
  const seenVariants = new Set<string>();
  const normalizedVariants = (variants ?? [])
    .map((variant, index) => {
      const optionValues = variant.optionValues.map((value) => value.trim());
      return {
        ...variant,
        optionValues,
        price:
          variant.price == null || Number.isNaN(variant.price)
            ? null
            : Number(variant.price),
        stock: Math.max(0, Math.trunc(variant.stock)),
        imageUrl: variant.imageUrl?.trim() || null,
        isVisible: variant.isVisible ?? true,
        sortOrder: variant.sortOrder ?? index,
      };
    })
    .filter((variant) => {
      if (
        optionCount === 0 ||
        variant.optionValues.length !== optionCount ||
        variant.optionValues.some((value) => value.length === 0)
      ) {
        return false;
      }

      const key = getVariantCombinationKey(variant.optionValues);
      if (seenVariants.has(key)) return false;
      seenVariants.add(key);
      return true;
    });

  return {
    options: normalizedVariants.length > 0 ? normalizedOptions : [],
    variants: normalizedVariants,
  };
}

async function syncProductImages(
  tx: ProductTx,
  productId: number,
  imagePayloads: { id: number; isMain: boolean }[],
) {
  for (const img of imagePayloads) {
    const updated = await tx
      .update(productImages)
      .set({
        productId,
        uploadStatus: "active",
        isMain: img.isMain,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(productImages.id, img.id),
          or(
            isNull(productImages.productId),
            eq(productImages.productId, productId),
          ),
          inArray(productImages.uploadStatus, ["pending", "active"]),
        ),
      )
      .returning({ id: productImages.id });

    if (updated.length === 0) {
      throw new Error(
        "Image payload not found or not claimable for this product",
      );
    }
  }
}

async function assertVariantsCanBeDeleted(tx: ProductTx, variantIds: number[]) {
  if (variantIds.length === 0) return;

  const referencedCartItem = await tx
    .select({ id: cartItems.id })
    .from(cartItems)
    .where(inArray(cartItems.productVariantId, variantIds))
    .limit(1);

  if (referencedCartItem.length > 0) {
    throw new Error(
      "No se pueden eliminar variantes que todavía están en carritos activos.",
      { cause: "variant_in_active_cart" },
    );
  }

  const referencedOrderItem = await tx
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(inArray(orderItems.productVariantId, variantIds))
    .limit(1);

  if (referencedOrderItem.length > 0) {
    throw new Error(
      "No se pueden eliminar variantes que ya fueron vendidas en pedidos.",
      { cause: "variant_in_order" },
    );
  }
}

async function syncProductVariants(
  tx: ProductTx,
  productId: number,
  options: ProductOptionInput[],
  variants: ProductVariantInput[],
) {
  const existingOptions = await tx.query.productOptions.findMany({
    where: eq(productOptions.productId, productId),
    orderBy: [asc(productOptions.sortOrder), asc(productOptions.id)],
  });

  if (options.length === 0 || variants.length === 0) {
    const existingVariants = await tx.query.productVariants.findMany({
      where: eq(productVariants.productId, productId),
      columns: { id: true },
    });
    await assertVariantsCanBeDeleted(
      tx,
      existingVariants.map((variant) => variant.id),
    );
    await tx
      .delete(productVariants)
      .where(eq(productVariants.productId, productId));
    await tx
      .delete(productOptions)
      .where(eq(productOptions.productId, productId));
    return;
  }

  const existingVariants = await tx.query.productVariants.findMany({
    where: eq(productVariants.productId, productId),
  });
  const existingVariantIds = existingVariants.map((variant) => variant.id);

  if (existingVariantIds.length > 0) {
    await tx
      .delete(productVariantOptionValues)
      .where(inArray(productVariantOptionValues.variantId, existingVariantIds));
  }

  const optionValueIdByOptionIndexAndValue = new Map<string, number>();
  const keptOptionIds: number[] = [];

  for (const [optionIndex, option] of options.entries()) {
    const existingOption = option.id
      ? existingOptions.find((entry) => entry.id === option.id)
      : existingOptions[optionIndex];

    let optionId: number;
    const optionValues = {
      productId,
      name: option.name,
      selectorDisplay: option.selectorDisplay ?? "dropdown",
      sortOrder: option.sortOrder ?? optionIndex,
      updatedAt: new Date(),
    };

    if (existingOption) {
      const [updatedOption] = await tx
        .update(productOptions)
        .set(optionValues)
        .where(eq(productOptions.id, existingOption.id))
        .returning({ id: productOptions.id });
      optionId = updatedOption.id;
    } else {
      const [createdOption] = await tx
        .insert(productOptions)
        .values({
          ...optionValues,
          createdAt: new Date(),
        })
        .returning({ id: productOptions.id });
      optionId = createdOption.id;
    }

    keptOptionIds.push(optionId);

    await tx
      .delete(productOptionValues)
      .where(eq(productOptionValues.optionId, optionId));

    const insertedValues = await tx
      .insert(productOptionValues)
      .values(
        option.values.map((value, valueIndex) => ({
          optionId,
          value: value.value,
          sortOrder: value.sortOrder ?? valueIndex,
        })),
      )
      .returning({
        id: productOptionValues.id,
        value: productOptionValues.value,
      });

    for (const value of insertedValues) {
      optionValueIdByOptionIndexAndValue.set(
        `${optionIndex}:${getOptionValueKey(value.value)}`,
        value.id,
      );
    }
  }

  const staleOptionIds = existingOptions
    .map((option) => option.id)
    .filter((id) => !keptOptionIds.includes(id));
  if (staleOptionIds.length > 0) {
    await tx
      .delete(productOptions)
      .where(inArray(productOptions.id, staleOptionIds));
  }

  const keptVariantIds: number[] = [];

  for (const [index, variant] of variants.entries()) {
    const variantValues = {
      productId,
      price: variant.price,
      stock: variant.stock,
      imageUrl: variant.imageUrl ?? null,
      isVisible: variant.isVisible ?? true,
      sortOrder: variant.sortOrder ?? index,
      updatedAt: new Date(),
    };

    const existingVariant = variant.id
      ? existingVariants.find((entry) => entry.id === variant.id)
      : undefined;

    let variantId: number;
    if (existingVariant) {
      const [updatedVariant] = await tx
        .update(productVariants)
        .set(variantValues)
        .where(eq(productVariants.id, existingVariant.id))
        .returning({ id: productVariants.id });
      variantId = updatedVariant.id;
    } else {
      const [createdVariant] = await tx
        .insert(productVariants)
        .values({
          ...variantValues,
          createdAt: new Date(),
        })
        .returning({ id: productVariants.id });
      variantId = createdVariant.id;
    }

    keptVariantIds.push(variantId);

    for (const [optionIndex, optionValue] of variant.optionValues.entries()) {
      const optionId = keptOptionIds[optionIndex];
      const optionValueId = optionValueIdByOptionIndexAndValue.get(
        `${optionIndex}:${getOptionValueKey(optionValue)}`,
      );
      if (!optionId || !optionValueId) {
        throw new Error(`Option value missing for ${optionValue}`);
      }

      await tx.insert(productVariantOptionValues).values({
        variantId,
        optionId,
        optionValueId,
      });
    }
  }

  const staleVariantIds = existingVariantIds.filter(
    (id) => !keptVariantIds.includes(id),
  );
  if (staleVariantIds.length > 0) {
    await assertVariantsCanBeDeleted(tx, staleVariantIds);
    await tx
      .delete(productVariants)
      .where(inArray(productVariants.id, staleVariantIds));
  }
}

type SortableRelationFields = {
  sortOrder: SQLWrapper | AnyColumn;
  id: SQLWrapper | AnyColumn;
};

function relationalOrderBy<T extends SortableRelationFields>(
  fn: (fields: T, operators: OrderByOperators) => ReturnType<typeof asc>[],
) {
  return fn;
}

function buildProductQuery(visibleOnly = false) {
  return {
    where: visibleOnly ? eq(products.isVisible, true) : undefined,
    with: {
      images: true,
      options: {
        with: {
          values: {
            orderBy: relationalOrderBy((values, { asc: orderAsc }) => [
              orderAsc(values.sortOrder),
              orderAsc(values.id),
            ]),
          },
        },
        orderBy: relationalOrderBy((options, { asc: orderAsc }) => [
          orderAsc(options.sortOrder),
          orderAsc(options.id),
        ]),
      },
      variants: {
        where: visibleOnly ? eq(productVariants.isVisible, true) : undefined,
        with: {
          selections: {
            with: {
              option: true,
              optionValue: true,
            },
          },
        },
        orderBy: relationalOrderBy((variants, { asc: orderAsc }) => [
          orderAsc(variants.sortOrder),
          orderAsc(variants.id),
        ]),
      },
    },
  } as const;
}

export async function createProduct(data: NewProductData) {
  const currentProfile = await getCurrentUserProfile();
  if (!currentProfile || currentProfile.role !== "admin") {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción.",
    };
  }

  const { imagePayloads = [], variantOptions, variants, ...productData } = data;
  const normalizedVariants = normalizeVariantInputs(variantOptions, variants);
  if (normalizedVariants.variants.length > 0) {
    productData.stock = 0;
  }

  if (productData.availableDate) {
    productData.availableDate = normalizeAvailableDate(
      productData.availableDate,
    );
  }

  let createdSlug: string | undefined;

  try {
    await db.transaction(async (tx) => {
      const insertData = {
        ...productData,
        availableDate:
          productData.availableDate != null
            ? normalizeAvailableDate(productData.availableDate)
            : productData.availableDate,
      } as typeof productData & { availableDate?: Date | null };

      const baseSlug = slugifyName(productData.name);
      const slug = await ensureUniqueSlug(tx, baseSlug);
      const [product] = await tx
        .insert(products)
        .values({ ...insertData, slug })
        .returning();
      createdSlug = product.slug;

      await syncProductImages(tx, product.id, imagePayloads);
      await syncProductVariants(
        tx,
        product.id,
        normalizedVariants.options,
        normalizedVariants.variants,
      );
    });
  } catch (error) {
    console.error(error);
    if (
      error instanceof Error &&
      (error.cause === "variant_in_active_cart" ||
        error.cause === "variant_in_order")
    ) {
      return { success: false, message: error.message };
    }
    return { success: false, message: "No se pudo crear el producto." };
  }

  revalidatePath("/dashboard/store/products");
  revalidatePath("/dashboard/store/analytics");
  if (createdSlug) {
    revalidatePath(`/store/products/${createdSlug}`);
  }
  revalidatePath("/store");
  return { success: true, message: "Producto creado correctamente." };
}

export async function updateProduct(id: number, data: NewProductData) {
  const currentProfile = await getCurrentUserProfile();
  if (!currentProfile || currentProfile.role !== "admin") {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción.",
    };
  }

  const { imagePayloads = [], variantOptions, variants, ...productData } = data;
  const normalizedVariants = normalizeVariantInputs(variantOptions, variants);
  if (normalizedVariants.variants.length > 0) {
    productData.stock = 0;
  }

  if (productData.availableDate) {
    productData.availableDate = normalizeAvailableDate(
      productData.availableDate,
    );
  }

  let previousSlug: string | undefined;
  let nextSlug: string | undefined;

  try {
    await db.transaction(async (tx) => {
      const existing = await tx.query.products.findFirst({
        where: eq(products.id, id),
      });
      if (!existing) {
        throw new Error("Product not found");
      }
      previousSlug = existing.slug;

      const updateData = {
        ...productData,
        availableDate:
          productData.availableDate != null
            ? normalizeAvailableDate(productData.availableDate)
            : productData.availableDate,
        updatedAt: new Date(),
      } as typeof productData & {
        availableDate?: Date | null;
        updatedAt: Date;
        slug?: string;
      };

      if (productData.name !== existing.name) {
        const baseSlug = slugifyName(productData.name);
        nextSlug = await ensureUniqueSlug(tx, baseSlug, id, id);
        updateData.slug = nextSlug;
      }

      await tx.update(products).set(updateData).where(eq(products.id, id));
      await syncProductImages(tx, id, imagePayloads);
      await syncProductVariants(
        tx,
        id,
        normalizedVariants.options,
        normalizedVariants.variants,
      );
    });
  } catch (error) {
    console.error(error);
    if (
      error instanceof Error &&
      (error.cause === "variant_in_active_cart" ||
        error.cause === "variant_in_order")
    ) {
      return { success: false, message: error.message };
    }
    return { success: false, message: "No se pudo actualizar el producto." };
  }

  revalidatePath("/dashboard/store/products");
  revalidatePath("/dashboard/store/analytics");
  if (previousSlug) {
    revalidatePath(`/store/products/${previousSlug}`);
  }
  if (nextSlug && nextSlug !== previousSlug) {
    revalidatePath(`/store/products/${nextSlug}`);
  }
  revalidatePath("/store");
  return { success: true, message: "Producto actualizado correctamente." };
}

export async function deleteProduct(id: number) {
  const currentProfile = await getCurrentUserProfile();
  if (!currentProfile || currentProfile.role !== "admin") {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción.",
    };
  }

  let deletedSlug: string | undefined;
  try {
    const row = await db.query.products.findFirst({
      where: eq(products.id, id),
      columns: { slug: true },
    });
    deletedSlug = row?.slug;
    await db.delete(products).where(eq(products.id, id));
  } catch (error) {
    console.error(error);
    return { success: false, message: "No se pudo eliminar el producto." };
  }

  revalidatePath("/dashboard/store/products");
  revalidatePath("/dashboard/store/analytics");
  if (deletedSlug) {
    revalidatePath(`/store/products/${deletedSlug}`);
  }
  revalidatePath("/store");
  return { success: true, message: "Producto eliminado correctamente." };
}

/**
 * Product fetchers use safe fallbacks on error: they do not throw.
 * - fetchProduct returns undefined when not found, null on error.
 * - fetchProducts and fetchFeaturedProducts return [] on error.
 * Callers can rely on these defaults without try/catch.
 */

export async function fetchProducts(
  sort: "default" | "updatedAt" = "default",
  options: { visibleOnly?: boolean } = {},
) {
  const { visibleOnly = false } = options;

  try {
    const rows = await db.query.products.findMany({
      ...buildProductQuery(visibleOnly),
      orderBy:
        sort === "updatedAt"
          ? [desc(products.updatedAt)]
          : [desc(products.isFeatured), desc(products.createdAt)],
    });

    if (sort === "updatedAt") {
      return rows;
    }

    return rows.sort((a, b) => {
      const aInStock = getProductEffectiveStock(a) > 0 ? 0 : 1;
      const bInStock = getProductEffectiveStock(b) > 0 ? 0 : 1;
      if (aInStock !== bInStock) {
        return aInStock - bInStock;
      }

      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function fetchProduct(id: number) {
  try {
    return await db.query.products.findFirst({
      ...buildProductQuery(false),
      where: eq(products.id, id),
    });
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function fetchProductBySlug(
  slug: string,
  options: { visibleOnly?: boolean } = {},
) {
  const { visibleOnly = false } = options;

  try {
    return await db.query.products.findFirst({
      ...buildProductQuery(visibleOnly),
      where: visibleOnly
        ? and(eq(products.slug, slug), eq(products.isVisible, true))
        : eq(products.slug, slug),
    });
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function toggleProductVisibility(
  id: number,
  isVisible: boolean,
): Promise<{ success: boolean; message: string }> {
  const currentProfile = await getCurrentUserProfile();
  if (!currentProfile || currentProfile.role !== "admin") {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción.",
    };
  }

  try {
    const [updated] = await db
      .update(products)
      .set({ isVisible, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning({ slug: products.slug });

    if (!updated) {
      return { success: false, message: "Producto no encontrado." };
    }

    revalidatePath(`/store/products/${updated.slug}`);
  } catch (error) {
    console.error(error);
    return { success: false, message: "No se pudo actualizar la visibilidad." };
  }

  revalidatePath("/dashboard/store/products");
  revalidatePath("/store");
  return {
    success: true,
    message: isVisible ? "Producto visible." : "Producto oculto.",
  };
}

export async function updateProductStock(
  id: number,
  stock: number | null,
): Promise<{ success: boolean; message: string }> {
  const currentProfile = await getCurrentUserProfile();
  if (!currentProfile || currentProfile.role !== "admin") {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción.",
    };
  }

  const variantCount = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.productId, id))
    .limit(1);
  if (variantCount.length > 0) {
    return {
      success: false,
      message:
        "Este producto usa variantes. Edita el stock desde sus variantes.",
    };
  }

  let validatedStock: number | null = stock;
  if (stock !== null) {
    if (!Number.isFinite(stock) || !Number.isInteger(stock) || stock < 0) {
      return {
        success: false,
        message: "El stock debe ser un numero entero mayor o igual a 0.",
      };
    }
    validatedStock = stock;
  }

  try {
    const [updated] = await db
      .update(products)
      .set({ stock: validatedStock, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning({ slug: products.slug });

    if (!updated) {
      return { success: false, message: "Producto no encontrado." };
    }

    revalidatePath(`/store/products/${updated.slug}`);
    revalidatePath("/dashboard/store/products");
    revalidatePath("/dashboard/store/analytics");
    revalidatePath("/store");
    return { success: true, message: "Stock actualizado." };
  } catch (error) {
    console.error(error);
    return { success: false, message: "No se pudo actualizar el stock." };
  }
}

export async function bulkToggleProductVisibility(
  ids: number[],
  isVisible: boolean,
): Promise<{ success: boolean; message: string; slugs: string[] }> {
  if (ids.length === 0) {
    return {
      success: true,
      message: "No hay productos seleccionados.",
      slugs: [],
    };
  }

  const currentProfile = await getCurrentUserProfile();
  if (!currentProfile || currentProfile.role !== "admin") {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción.",
      slugs: [],
    };
  }

  let slugs: string[] = [];
  let updatedCount = 0;
  try {
    const updatedRows = await db
      .update(products)
      .set({ isVisible, updatedAt: new Date() })
      .where(inArray(products.id, ids))
      .returning({ id: products.id, slug: products.slug });

    if (updatedRows.length === 0) {
      return {
        success: false,
        message: "No se encontraron productos para actualizar.",
        slugs: [],
      };
    }

    slugs = updatedRows.map((row) => row.slug);
    updatedCount = updatedRows.length;
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo actualizar la visibilidad.",
      slugs: [],
    };
  }

  revalidatePath("/dashboard/store/products");
  revalidatePath("/store");
  for (const slug of slugs) {
    revalidatePath(`/store/products/${slug}`);
  }

  return {
    success: true,
    message: isVisible
      ? `${updatedCount} productos visibles.`
      : `${updatedCount} productos ocultos.`,
    slugs,
  };
}

export async function bulkDeleteProducts(
  ids: number[],
): Promise<{ success: boolean; message: string }> {
  if (ids.length === 0) {
    return { success: true, message: "No hay productos seleccionados." };
  }

  const currentProfile = await getCurrentUserProfile();
  if (!currentProfile || currentProfile.role !== "admin") {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción.",
    };
  }

  let deletedSlugs: string[] = [];
  let deletedCount = 0;
  try {
    const deletedRows = await db
      .delete(products)
      .where(inArray(products.id, ids))
      .returning({ slug: products.slug });
    deletedSlugs = deletedRows.map((row) => row.slug);
    deletedCount = deletedRows.length;
  } catch (error) {
    console.error(error);
    return { success: false, message: "No se pudo eliminar los productos." };
  }

  revalidatePath("/dashboard/store/products");
  revalidatePath("/dashboard/store/analytics");
  for (const slug of deletedSlugs) {
    revalidatePath(`/store/products/${slug}`);
  }
  revalidatePath("/store");
  return { success: true, message: `${deletedCount} productos eliminados.` };
}

export async function fetchLowStockProducts(
  threshold = 5,
): Promise<LowStockEntry[]> {
  try {
    const allProducts = await db.query.products.findMany({
      ...buildProductQuery(false),
      orderBy: [asc(products.name)],
    });

    const entries: LowStockEntry[] = [];
    for (const product of allProducts) {
      if ((product.variants?.length ?? 0) > 0) {
        for (const variant of product.variants ?? []) {
          if (variant.isVisible && variant.stock <= threshold) {
            const label = variant.selections
              .map(
                (selection) =>
                  `${selection.option.name}: ${selection.optionValue.value}`,
              )
              .join(" / ");
            entries.push({
              productId: product.id,
              productName: product.name,
              variantId: variant.id,
              variantLabel: label || null,
              stock: variant.stock,
            });
          }
        }
      } else if ((product.stock ?? 0) <= threshold) {
        entries.push({
          productId: product.id,
          productName: product.name,
          variantId: null,
          variantLabel: null,
          stock: product.stock ?? 0,
        });
      }
    }

    return entries.sort((a, b) => a.stock - b.stock);
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function fetchFeaturedProducts() {
  try {
    return await db.query.products.findMany({
      ...buildProductQuery(true),
      where: and(eq(products.isFeatured, true), eq(products.isVisible, true)),
      orderBy: [desc(products.createdAt)],
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}
