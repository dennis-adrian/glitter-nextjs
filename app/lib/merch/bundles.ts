import "server-only";

import { cache } from "react";
import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  cartBundleSelections,
  cartBundles,
  merchBundleCollections,
  merchBundleComponents,
  merchBundleComponentVariants,
  merchBundles,
  merchCollections,
  products,
} from "@/db/schema";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import type {
  BundleCatalogProduct,
  BundleEvaluation,
  BundleRecord,
  BundleSelectionInput,
  CartBundleLine,
  PublicBundle,
} from "./bundle-definitions";
import {
  aggregateStockDemand,
  bundleHasStock,
  bundleUnitDemand,
  evaluateBundle,
  maxBundleQuantity,
  resolveBundleSelection,
  stockResourceKey,
  type StockDemandLine,
} from "./bundle-pricing";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type BundleDatabase = typeof db | Transaction;

/** Loads bundle definitions (components, eligible variants, collections). */
export async function loadBundleRecords(
  database: BundleDatabase,
  filter: { ids?: readonly number[]; visibleOnly?: boolean } = {},
): Promise<BundleRecord[]> {
  const conditions: SQL[] = [];
  if (filter.ids) {
    if (filter.ids.length === 0) return [];
    conditions.push(inArray(merchBundles.id, [...filter.ids]));
  }
  if (filter.visibleOnly) conditions.push(eq(merchBundles.isVisible, true));
  const bundles = await database
    .select()
    .from(merchBundles)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(merchBundles.sortOrder), desc(merchBundles.id));
  if (bundles.length === 0) return [];
  const bundleIds = bundles.map((bundle) => bundle.id);
  const [components, collections] = await Promise.all([
    database
      .select()
      .from(merchBundleComponents)
      .where(inArray(merchBundleComponents.bundleId, bundleIds))
      .orderBy(
        asc(merchBundleComponents.sortOrder),
        asc(merchBundleComponents.id),
      ),
    database
      .select()
      .from(merchBundleCollections)
      .where(inArray(merchBundleCollections.bundleId, bundleIds)),
  ]);
  const variants = components.length
    ? await database
        .select()
        .from(merchBundleComponentVariants)
        .where(
          inArray(
            merchBundleComponentVariants.componentId,
            components.map((component) => component.id),
          ),
        )
    : [];
  return bundles.map((bundle) => ({
    id: bundle.id,
    name: bundle.name,
    slug: bundle.slug,
    description: bundle.description,
    imageUrl: bundle.imageUrl,
    price: bundle.price,
    isVisible: bundle.isVisible,
    sortOrder: bundle.sortOrder,
    version: bundle.version,
    components: components
      .filter((component) => component.bundleId === bundle.id)
      .map((component) => ({
        id: component.id,
        productId: component.productId,
        quantity: component.quantity,
        sortOrder: component.sortOrder,
        variantIds: variants
          .filter((variant) => variant.componentId === component.id)
          .map((variant) => variant.variantId)
          .sort((a, b) => a - b),
      })),
    collectionIds: collections
      .filter((membership) => membership.bundleId === bundle.id)
      .map((membership) => membership.collectionId),
  }));
}

const catalogRelations = {
  images: true,
  variants: {
    with: {
      selections: { with: { option: true, optionValue: true } },
    },
  },
} as const;

/** Current catalog rows for the given products, including hidden variants. */
export async function loadBundleCatalog(
  database: BundleDatabase,
  productIds: readonly number[],
): Promise<Map<number, BundleCatalogProduct>> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return new Map();
  const rows = await database.query.products.findMany({
    where: inArray(products.id, ids),
    with: catalogRelations,
  });
  return new Map(rows.map((row) => [row.id, row]));
}

function componentProductIds(records: readonly BundleRecord[]) {
  return records.flatMap((record) =>
    record.components.map((component) => component.productId),
  );
}

export type BundleManagementRow = BundleRecord & {
  evaluation: BundleEvaluation;
  inStock: boolean;
};

async function assertAdmin() {
  const profile = await getCurrentUserProfile();
  if (profile?.role !== "admin") throw new Error("Unauthorized");
}

export async function fetchBundleManagement(): Promise<BundleManagementRow[]> {
  await assertAdmin();
  const records = await loadBundleRecords(db);
  const catalog = await loadBundleCatalog(db, componentProductIds(records));
  return records.map((record) => {
    const evaluation = evaluateBundle(record, catalog, { mode: "sale" });
    return {
      ...record,
      evaluation,
      inStock: bundleHasStock(evaluation.components),
    };
  });
}

/**
 * A bundle's save token: `updated_at` as text, at the database's microsecond
 * precision (a JS Date would truncate it to milliseconds), so the value the
 * editor loads compares exactly with the stored one.
 */
export function bundleRevisionSql() {
  return sql<string>`${merchBundles.updatedAt}::text`;
}

export async function fetchBundleEditorData(bundleId?: number) {
  await assertAdmin();
  // The token is read before the definition: a save landing in between makes
  // this editor's save fail instead of silently undoing that save.
  const [saved] =
    bundleId === undefined
      ? []
      : await db
          .select({ revision: bundleRevisionSql() })
          .from(merchBundles)
          .where(eq(merchBundles.id, bundleId));
  const [record] =
    bundleId === undefined
      ? [undefined]
      : await loadBundleRecords(db, { ids: [bundleId] });
  const usedProductIds = record ? componentProductIds([record]) : [];
  const [catalog, collectionOptions] = await Promise.all([
    db.query.products.findMany({
      // Keep products already in the bundle even if they left merch, so the
      // editor can show why the bundle is unavailable and remove them.
      where: usedProductIds.length
        ? or(
            eq(products.storeCategory, "merch"),
            inArray(products.id, usedProductIds),
          )
        : eq(products.storeCategory, "merch"),
      with: catalogRelations,
      orderBy: [asc(products.name), asc(products.id)],
    }),
    db
      .select({ id: merchCollections.id, name: merchCollections.name })
      .from(merchCollections)
      .orderBy(asc(merchCollections.sortOrder), desc(merchCollections.id)),
  ]);
  return {
    bundle: record ?? null,
    revision: saved?.revision ?? null,
    products: catalog,
    collectionOptions,
  };
}

/** Published bundles that can currently be sold, in store order. */
export const fetchPublicBundles = cache(async (): Promise<PublicBundle[]> => {
  const records = await loadBundleRecords(db, { visibleOnly: true });
  const catalog = await loadBundleCatalog(db, componentProductIds(records));
  return records.flatMap((record) => {
    const evaluation = evaluateBundle(record, catalog, { mode: "sale" });
    if (
      evaluation.issues.length > 0 ||
      evaluation.separateMinCents == null ||
      evaluation.separateMaxCents == null
    ) {
      return [];
    }
    return [
      {
        id: record.id,
        name: record.name,
        slug: record.slug,
        description: record.description,
        imageUrl: record.imageUrl,
        version: record.version,
        sortOrder: record.sortOrder,
        collectionIds: record.collectionIds,
        priceCents: evaluation.priceCents,
        separateMinCents: evaluation.separateMinCents,
        separateMaxCents: evaluation.separateMaxCents,
        components: evaluation.components,
        inStock: bundleHasStock(evaluation.components),
      },
    ];
  });
});

export const fetchPublicBundle = cache(async (slug: string) => {
  const bundles = await fetchPublicBundles();
  return bundles.find((bundle) => bundle.slug === slug) ?? null;
});

export type CartBundleRequest = {
  key: string;
  cartBundleId: number | null;
  bundleId: number;
  bundleVersion: number;
  quantity: number;
  selections: BundleSelectionInput[];
};

/**
 * Resolves cart bundle lines against the current catalog. Stock is shared:
 * each line's limit subtracts the individual lines and every other bundle
 * line, so two bundles cannot both count on the same last unit.
 */
export async function resolveCartBundleLines(
  requests: readonly CartBundleRequest[],
  individualDemand: readonly StockDemandLine[],
  options: {
    /**
     * Whether an unpublished bundle may show its name and price. Stored cart
     * lines may; ids sent by anonymous clients must not expose drafts.
     */
    revealUnpublished?: boolean;
  } = {},
): Promise<CartBundleLine[]> {
  if (requests.length === 0) return [];
  const records = await loadBundleRecords(db, {
    ids: [...new Set(requests.map((request) => request.bundleId))],
  });
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const catalog = await loadBundleCatalog(db, componentProductIds(records));
  const evaluations = new Map(
    records.map((record) => [
      record.id,
      evaluateBundle(record, catalog, { mode: "sale" }),
    ]),
  );

  const resolved = requests.map((request) => {
    const found = recordsById.get(request.bundleId);
    const record =
      found && (found.isVisible || options.revealUnpublished)
        ? found
        : undefined;
    const evaluation = record ? evaluations.get(request.bundleId) : undefined;
    const base: CartBundleLine = {
      key: request.key,
      cartBundleId: request.cartBundleId,
      bundleId: request.bundleId,
      bundleVersion: request.bundleVersion,
      currentVersion: record?.version ?? null,
      name: record?.name ?? "Combo no disponible",
      slug: record?.slug ?? "",
      imageUrl: record?.imageUrl ?? null,
      quantity: request.quantity,
      selections: request.selections,
      unitPriceCents: evaluation?.priceCents ?? 0,
      separateUnitPriceCents: evaluation?.separateMinCents ?? 0,
      components: [],
      maxQuantity: 0,
      issue: null,
      message: null,
    };
    if (
      !record ||
      !evaluation ||
      !record.isVisible ||
      evaluation.issues.length
    ) {
      return {
        ...base,
        issue: "unavailable" as const,
        message: "Este combo ya no está disponible.",
      };
    }
    const selection = resolveBundleSelection(evaluation, request.selections);
    if (!selection.ok) {
      return {
        ...base,
        issue: "selection_invalid" as const,
        message: selection.message,
      };
    }
    return {
      ...base,
      imageUrl: record.imageUrl ?? selection.components[0]?.imageUrl ?? null,
      separateUnitPriceCents: selection.separateCents,
      components: selection.components,
      ...(record.version !== request.bundleVersion
        ? {
            issue: "stale" as const,
            message:
              "Este combo cambió desde que lo agregaste. Revisá su precio y contenido.",
          }
        : {}),
    };
  });

  const bundleDemand = resolved.map((line) =>
    [...bundleUnitDemand(line.components)].map(([key, units]) => ({
      key,
      quantity: units * line.quantity,
    })),
  );
  const baseDemand = aggregateStockDemand(individualDemand);
  return resolved.map((line, index) => {
    if (line.components.length === 0) return line;
    const otherDemand = new Map(baseDemand);
    bundleDemand.forEach((entries, otherIndex) => {
      if (otherIndex === index) return;
      for (const entry of entries) {
        otherDemand.set(
          entry.key,
          (otherDemand.get(entry.key) ?? 0) + entry.quantity,
        );
      }
    });
    const maxQuantity = maxBundleQuantity(line.components, otherDemand);
    if (line.issue) return { ...line, maxQuantity };
    if (maxQuantity === 0) {
      return {
        ...line,
        maxQuantity,
        issue: "out_of_stock" as const,
        message: "Sin stock para este combo.",
      };
    }
    if (line.quantity > maxQuantity) {
      return {
        ...line,
        maxQuantity,
        issue: "stock_insufficient" as const,
        message: `Solo quedan ${maxQuantity} disponibles.`,
      };
    }
    return { ...line, maxQuantity };
  });
}

/** Bundle lines stored in an authenticated cart, oldest first. */
export async function loadCartBundleRequests(
  database: BundleDatabase,
  cartId: number,
  options: { lock?: boolean } = {},
): Promise<CartBundleRequest[]> {
  const query = database
    .select()
    .from(cartBundles)
    .where(eq(cartBundles.cartId, cartId))
    .orderBy(asc(cartBundles.id));
  const rows = options.lock ? await query.for("update") : await query;
  if (rows.length === 0) return [];
  const selections = await database
    .select()
    .from(cartBundleSelections)
    .where(
      inArray(
        cartBundleSelections.cartBundleId,
        rows.map((row) => row.id),
      ),
    );
  return rows.map((row) => ({
    key: `cart-bundle:${row.id}`,
    cartBundleId: row.id,
    bundleId: row.bundleId,
    bundleVersion: row.bundleVersion,
    quantity: row.quantity,
    selections: selections
      .filter((selection) => selection.cartBundleId === row.id)
      .map((selection) => ({
        componentId: selection.componentId,
        productVariantId: selection.productVariantId,
      }))
      .sort((a, b) => a.componentId - b.componentId),
  }));
}

/**
 * Sale-stock units a set of bundle lines would take, read from their stored
 * definitions without pricing them. Used to cap individual cart lines.
 */
export function estimateBundleDemand(
  requests: readonly Pick<
    CartBundleRequest,
    "bundleId" | "quantity" | "selections"
  >[],
  records: readonly BundleRecord[],
): Map<string, number> {
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const demand = new Map<string, number>();
  for (const request of requests) {
    const record = recordsById.get(request.bundleId);
    if (!record) continue;
    const chosen = new Map(
      request.selections.map((selection) => [
        selection.componentId,
        selection.productVariantId,
      ]),
    );
    for (const component of record.components) {
      const variantId =
        chosen.get(component.id) ??
        (component.variantIds.length === 1 ? component.variantIds[0] : null);
      if (variantId == null && component.variantIds.length > 1) continue;
      const key = stockResourceKey(component.productId, variantId);
      demand.set(
        key,
        (demand.get(key) ?? 0) + component.quantity * request.quantity,
      );
    }
  }
  return demand;
}

export async function loadCartBundleDemand(
  database: BundleDatabase,
  cartId: number,
  excludeCartBundleId?: number,
): Promise<Map<string, number>> {
  const requests = (await loadCartBundleRequests(database, cartId)).filter(
    (request) => request.cartBundleId !== excludeCartBundleId,
  );
  if (requests.length === 0) return new Map();
  const records = await loadBundleRecords(database, {
    ids: [...new Set(requests.map((request) => request.bundleId))],
  });
  return estimateBundleDemand(requests, records);
}

/** Variant ids referenced by bundles or by carts holding bundles. */
export async function findBundleVariantReferences(
  database: BundleDatabase,
  variantIds: readonly number[],
) {
  if (variantIds.length === 0) return [];
  return database
    .select({ variantId: merchBundleComponentVariants.variantId })
    .from(merchBundleComponentVariants)
    .where(inArray(merchBundleComponentVariants.variantId, [...variantIds]))
    .limit(1);
}

export async function findBundleProductReferences(
  database: BundleDatabase,
  productIds: readonly number[],
) {
  if (productIds.length === 0) return [];
  return database
    .select({
      productId: merchBundleComponents.productId,
      bundleName: merchBundles.name,
    })
    .from(merchBundleComponents)
    .innerJoin(
      merchBundles,
      eq(merchBundles.id, merchBundleComponents.bundleId),
    )
    .where(inArray(merchBundleComponents.productId, [...productIds]))
    .limit(1);
}
