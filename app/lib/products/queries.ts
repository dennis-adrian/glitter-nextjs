import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm/column";
import type { OrderByOperators } from "drizzle-orm/relations";
import type { SQLWrapper } from "drizzle-orm/sql/sql";

import { getProductEffectiveStock } from "@/app/lib/products/variants";
import type { StoreCategory } from "@/app/lib/store/category";
import { db } from "@/db";
import { productContentSections, products, productVariants } from "@/db/schema";

/*
 * Product reads. Server-only, not server actions: `visibleOnly` decides whether
 * hidden products come back, so it must stay a server-side decision, and
 * these are only ever called from server components and other server code.
 */

type SortableRelationFields = {
  sortOrder: SQLWrapper | AnyColumn;
  id: SQLWrapper | AnyColumn;
};

function relationalOrderBy<T extends SortableRelationFields>(
  fn: (fields: T, operators: OrderByOperators) => ReturnType<typeof asc>[],
) {
  return fn;
}

function buildProductWhere({
  visibleOnly = false,
  storeCategory,
}: {
  visibleOnly?: boolean;
  storeCategory?: StoreCategory;
} = {}) {
  const conditions = [];
  if (visibleOnly) {
    conditions.push(eq(products.isVisible, true));
  }
  if (storeCategory) {
    conditions.push(eq(products.storeCategory, storeCategory));
  }

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

export function buildProductQuery({
  visibleOnly = false,
  storeCategory,
}: {
  visibleOnly?: boolean;
  storeCategory?: StoreCategory;
} = {}) {
  return {
    where: buildProductWhere({ visibleOnly, storeCategory }),
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
      contentSections: {
        // Hidden sections are draft copy: the storefront never ships them.
        where: visibleOnly
          ? eq(productContentSections.isVisible, true)
          : undefined,
        orderBy: relationalOrderBy((sections, { asc: orderAsc }) => [
          orderAsc(sections.sortOrder),
          orderAsc(sections.id),
        ]),
      },
    },
  } as const;
}

type AdminStockFields = {
  unitCost: number | null;
  lowStockThreshold: number | null;
};

type StorefrontProductInput = AdminStockFields & {
  variants?: AdminStockFields[];
};

/**
 * The storefront copy of a product. Unit cost and the low-stock threshold are
 * admin data, and storefront rows end up in client components' props, so
 * they are cleared on the server rather than trusted to stay unrendered.
 */
function toStorefrontProduct<T extends StorefrontProductInput>(product: T): T {
  return {
    ...product,
    unitCost: null,
    lowStockThreshold: null,
    ...(product.variants
      ? {
          variants: product.variants.map((variant) => ({
            ...variant,
            unitCost: null,
            lowStockThreshold: null,
          })),
        }
      : {}),
  };
}

/**
 * Product fetchers use safe fallbacks on error: they do not throw.
 * - fetchProduct returns undefined when not found, null on error.
 * - fetchProducts and fetchFeaturedProducts return [] on error.
 * Callers can rely on these defaults without try/catch.
 *
 * `visibleOnly` is the storefront switch: it drops hidden products, variants
 * and content sections, and clears unit cost and the low-stock threshold.
 * Without it the full admin row comes back.
 */

export async function fetchProducts(
  sort: "default" | "updatedAt" = "default",
  options: {
    visibleOnly?: boolean;
    storeCategory?: StoreCategory;
  } = {},
) {
  const { visibleOnly = false, storeCategory } = options;

  try {
    const fetched = await db.query.products.findMany({
      ...buildProductQuery({ visibleOnly, storeCategory }),
      orderBy:
        sort === "updatedAt"
          ? [desc(products.updatedAt)]
          : [desc(products.isFeatured), desc(products.createdAt)],
    });
    const rows = visibleOnly ? fetched.map(toStorefrontProduct) : fetched;

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
    const query = buildProductQuery();
    return await db.query.products.findFirst({
      ...query,
      where: query.where
        ? and(query.where, eq(products.id, id))
        : eq(products.id, id),
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
    const query = buildProductQuery({ visibleOnly });
    const product = await db.query.products.findFirst({
      ...query,
      where: query.where
        ? and(query.where, eq(products.slug, slug))
        : eq(products.slug, slug),
    });
    return product && visibleOnly ? toStorefrontProduct(product) : product;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function fetchFeaturedProducts() {
  try {
    const query = buildProductQuery({ visibleOnly: true });
    const rows = await db.query.products.findMany({
      ...query,
      where: query.where
        ? and(query.where, eq(products.isFeatured, true))
        : eq(products.isFeatured, true),
      orderBy: [desc(products.createdAt)],
    });
    return rows.map(toStorefrontProduct);
  } catch (error) {
    console.error(error);
    return [];
  }
}
