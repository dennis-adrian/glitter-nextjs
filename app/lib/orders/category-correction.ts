import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";

import {
  getAddedLineGroupKey,
  type ProjectionAdjustmentLine,
} from "@/app/lib/orders/projection";
import type { StoreCategory } from "@/app/lib/store/category";
import { db } from "@/db";
import {
  orderAdjustmentItems,
  orderAdjustments,
  orderEvents,
  orderItems,
  orders,
} from "@/db/schema";

export const HISTORICAL_CATEGORY_DEFAULT_DAYS = 45;
export const HISTORICAL_CATEGORY_MAX_SOURCES = 100;

export type HistoricalLineSourceType = "base" | "adjustment";

export type HistoricalLineCategorySource = {
  /** `base:<orderItemId>` or `adjustment:<representativeAdjustmentItemId>`. */
  sourceKey: string;
  sourceType: HistoricalLineSourceType;
  sourceId: number;
  orderId: number;
  orderRevision: number;
  orderDate: Date;
  orderStatus: string;
  productLabel: string;
  /** Effective quantity; zeroed groups still need a consistent snapshot. */
  quantity: number;
  snapshotCategory: StoreCategory;
  currentProductCategory: StoreCategory;
};

export type HistoricalLineCategoryFilters = {
  from?: Date;
  to?: Date;
  orderId?: number;
  q?: string;
  snapshotCategory?: StoreCategory;
  currentProductCategory?: StoreCategory;
};

export type HistoricalCategoryCorrectionSource = {
  sourceKey: string;
  orderId: number;
  expectedOrderRevision: number;
  expectedCategory: StoreCategory;
};

export type HistoricalCategoryCorrectionInput = {
  actorUserId: number;
  targetCategory: StoreCategory;
  reason: string;
  sources: readonly HistoricalCategoryCorrectionSource[];
};

export type HistoricalCategoryCorrectionResult = {
  changedSources: number;
  unchangedSources: number;
  changedOrders: number;
};

function fail(message: string, cause: string): never {
  throw Object.assign(new Error(message), { cause });
}

function productLabel(name: string, variantLabel: string | null): string {
  return variantLabel ? `${name} (${variantLabel})` : name;
}

function parseSourceKey(
  sourceKey: string,
): { type: HistoricalLineSourceType; id: number } | null {
  const match = /^(base|adjustment):(\d+)$/.exec(sourceKey);
  if (!match) return null;
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return { type: match[1] as HistoricalLineSourceType, id };
}

function toProjectionLine(
  line: typeof orderAdjustmentItems.$inferSelect,
): ProjectionAdjustmentLine {
  return {
    id: line.id,
    baseOrderItemId: line.baseOrderItemId,
    productId: line.productId,
    productVariantId: line.productVariantId,
    productNameSnapshot: line.productNameSnapshot,
    variantLabelSnapshot: line.variantLabelSnapshot,
    quantityDelta: line.quantityDelta,
    unitPriceSnapshot: line.unitPriceSnapshot,
    unitCostSnapshot: line.unitCostSnapshot,
    transactionType: line.transactionType,
    storeCategorySnapshot: line.storeCategorySnapshot,
  };
}

export async function fetchHistoricalLineCategorySources(
  filters: HistoricalLineCategoryFilters = {},
): Promise<HistoricalLineCategorySource[]> {
  return fetchHistoricalLineCategorySourcesWithDatabase(db, filters);
}

/** `LIKE` pattern for an already lowercased needle matched as plain text. */
function containsPattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * Mirrors the per-source filter below as an order-level `EXISTS`, so the row
 * cap keeps the newest *matching* orders instead of the newest orders overall.
 * Broader matches are harmless; the per-source filter still decides.
 */
function hasMatchingLine(
  filters: HistoricalLineCategoryFilters,
  search: string | undefined,
) {
  if (!filters.snapshotCategory && !filters.currentProductCategory && !search) {
    return undefined;
  }
  const pattern = search ? containsPattern(search) : undefined;
  const currentCategory = filters.currentProductCategory
    ? sql` and p.store_category = ${filters.currentProductCategory}`
    : sql.empty();
  const baseSnapshot = filters.snapshotCategory
    ? sql` and oi.store_category_at_purchase = ${filters.snapshotCategory}`
    : sql.empty();
  const addedSnapshot = filters.snapshotCategory
    ? sql` and oai.store_category_snapshot = ${filters.snapshotCategory}`
    : sql.empty();
  // Labels are recomposed exactly as `productLabel` does so the pre-filter
  // never drops an order the per-source search would have kept.
  const baseLabel = pattern
    ? sql` and lower(coalesce(oi.product_name_at_purchase, p.name) || coalesce(' (' || oi.product_variant_label || ')', '')) like ${pattern}`
    : sql.empty();
  const addedLabel = pattern
    ? sql` and lower(oai.product_name_snapshot || coalesce(' (' || oai.variant_label_snapshot || ')', '')) like ${pattern}`
    : sql.empty();

  return sql`(exists (
      select 1 from order_items oi
      join products p on p.id = oi.product_id
      where oi.order_id = ${orders.id}${baseSnapshot}${currentCategory}${baseLabel}
    ) or exists (
      select 1 from order_adjustment_items oai
      join order_adjustments oa on oa.id = oai.adjustment_id
      join products p on p.id = oai.product_id
      where oa.order_id = ${orders.id} and oai.base_order_item_id is null${addedSnapshot}${currentCategory}${addedLabel}
    ))`;
}

/** Database seam used by integration tests; application callers use the wrapper above. */
export async function fetchHistoricalLineCategorySourcesWithDatabase(
  database: typeof db,
  filters: HistoricalLineCategoryFilters = {},
): Promise<HistoricalLineCategorySource[]> {
  const from =
    filters.from ??
    (filters.orderId
      ? undefined
      : new Date(Date.now() - HISTORICAL_CATEGORY_DEFAULT_DAYS * 86_400_000));
  const search = filters.q?.trim().toLowerCase();
  const orderRows = await database
    .select({
      id: orders.id,
      revision: orders.revision,
      createdAt: orders.createdAt,
      status: orders.status,
    })
    .from(orders)
    .where(
      and(
        from ? gte(orders.createdAt, from) : undefined,
        filters.to ? lte(orders.createdAt, filters.to) : undefined,
        filters.orderId ? eq(orders.id, filters.orderId) : undefined,
        hasMatchingLine(filters, search),
      ),
    )
    // The id tiebreaker keeps the cap deterministic for same-timestamp orders.
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(HISTORICAL_CATEGORY_MAX_SOURCES);
  if (orderRows.length === 0) return [];

  const orderIds = orderRows.map((order) => order.id);
  const ordersById = new Map(orderRows.map((order) => [order.id, order]));

  const baseRows = await database.query.orderItems.findMany({
    where: inArray(orderItems.orderId, orderIds),
    with: { product: { columns: { name: true, storeCategory: true } } },
  });
  const adjustmentRows = await database
    .select({
      orderId: orderAdjustments.orderId,
      item: orderAdjustmentItems,
      currentProductCategory: sql<StoreCategory>`(
        select p.store_category from products p
        where p.id = ${orderAdjustmentItems.productId}
      )`,
    })
    .from(orderAdjustmentItems)
    .innerJoin(
      orderAdjustments,
      eq(orderAdjustmentItems.adjustmentId, orderAdjustments.id),
    )
    .where(
      and(
        inArray(orderAdjustments.orderId, orderIds),
        isNull(orderAdjustmentItems.baseOrderItemId),
      ),
    )
    .orderBy(asc(orderAdjustmentItems.id));

  const baseDeltas = await database
    .select({
      baseOrderItemId: orderAdjustmentItems.baseOrderItemId,
      quantityDelta: sql<number>`cast(coalesce(sum(${orderAdjustmentItems.quantityDelta}), 0) as integer)`,
    })
    .from(orderAdjustmentItems)
    .innerJoin(
      orderAdjustments,
      eq(orderAdjustmentItems.adjustmentId, orderAdjustments.id),
    )
    .where(inArray(orderAdjustments.orderId, orderIds))
    .groupBy(orderAdjustmentItems.baseOrderItemId);
  const deltasByBaseId = new Map(
    baseDeltas
      .filter((row) => row.baseOrderItemId != null)
      .map((row) => [row.baseOrderItemId!, Number(row.quantityDelta)]),
  );

  const sources: HistoricalLineCategorySource[] = [];
  for (const line of baseRows) {
    const order = ordersById.get(line.orderId)!;
    sources.push({
      sourceKey: `base:${line.id}`,
      sourceType: "base",
      sourceId: line.id,
      orderId: line.orderId,
      orderRevision: order.revision,
      orderDate: order.createdAt,
      orderStatus: order.status,
      productLabel: productLabel(
        line.productNameAtPurchase ?? line.product.name,
        line.productVariantLabel,
      ),
      quantity: line.quantity + (deltasByBaseId.get(line.id) ?? 0),
      snapshotCategory: line.storeCategoryAtPurchase,
      currentProductCategory: line.product.storeCategory,
    });
  }

  // Added lines are grouped by the canonical effective-line identity so a
  // correction moves exactly one effective line, never half of it.
  const groups = new Map<
    string,
    { row: (typeof adjustmentRows)[number]; quantity: number }
  >();
  for (const row of adjustmentRows) {
    const key = `${row.orderId}|${getAddedLineGroupKey(toProjectionLine(row.item))}`;
    const existing = groups.get(key);
    if (existing) existing.quantity += row.item.quantityDelta;
    else groups.set(key, { row, quantity: row.item.quantityDelta });
  }
  for (const { row, quantity } of groups.values()) {
    const order = ordersById.get(row.orderId)!;
    sources.push({
      sourceKey: `adjustment:${row.item.id}`,
      sourceType: "adjustment",
      sourceId: row.item.id,
      orderId: row.orderId,
      orderRevision: order.revision,
      orderDate: order.createdAt,
      orderStatus: order.status,
      productLabel: productLabel(
        row.item.productNameSnapshot,
        row.item.variantLabelSnapshot,
      ),
      quantity,
      snapshotCategory: row.item.storeCategorySnapshot,
      currentProductCategory: row.currentProductCategory,
    });
  }

  return sources
    .filter((source) => {
      if (
        filters.snapshotCategory &&
        source.snapshotCategory !== filters.snapshotCategory
      ) {
        return false;
      }
      if (
        filters.currentProductCategory &&
        source.currentProductCategory !== filters.currentProductCategory
      ) {
        return false;
      }
      if (search && !source.productLabel.toLowerCase().includes(search)) {
        return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        b.orderDate.getTime() - a.orderDate.getTime() ||
        b.orderId - a.orderId ||
        a.sourceKey.localeCompare(b.sourceKey),
    );
}

export async function correctHistoricalLineCategories(
  input: HistoricalCategoryCorrectionInput,
): Promise<HistoricalCategoryCorrectionResult> {
  return correctHistoricalLineCategoriesWithDatabase(db, input);
}

/**
 * Rewrites category snapshots only. Every product, grouping and audit detail
 * is derived from locked rows; submitted metadata is untrusted concurrency
 * data. Authorization belongs to the calling action.
 */
export async function correctHistoricalLineCategoriesWithDatabase(
  database: typeof db,
  input: HistoricalCategoryCorrectionInput,
): Promise<HistoricalCategoryCorrectionResult> {
  const reason = input.reason.trim();
  if (!reason)
    fail("Debes indicar el motivo de la corrección.", "invalid_input");
  if (input.sources.length === 0)
    fail("No seleccionaste ninguna línea.", "invalid_input");
  if (input.sources.length > HISTORICAL_CATEGORY_MAX_SOURCES) {
    fail(
      `Selecciona como máximo ${HISTORICAL_CATEGORY_MAX_SOURCES} líneas por corrección.`,
      "invalid_input",
    );
  }

  const parsedSources = input.sources.map((source) => {
    const parsed = parseSourceKey(source.sourceKey);
    if (
      !parsed ||
      !Number.isSafeInteger(source.orderId) ||
      source.orderId <= 0 ||
      !Number.isSafeInteger(source.expectedOrderRevision) ||
      source.expectedOrderRevision < 1
    ) {
      fail("La selección contiene datos inválidos.", "invalid_input");
    }
    return { ...source, ...parsed };
  });
  if (
    new Set(parsedSources.map((source) => source.sourceKey)).size !==
    parsedSources.length
  ) {
    fail("La selección contiene líneas repetidas.", "invalid_input");
  }

  const orderIds = [
    ...new Set(parsedSources.map((source) => source.orderId)),
  ].sort((a, b) => a - b);

  return database.transaction(async (tx) => {
    // Lock in ID order so concurrent adjustments serialize predictably.
    const lockedOrders = await tx
      .select()
      .from(orders)
      .where(inArray(orders.id, orderIds))
      .orderBy(asc(orders.id))
      .for("update");
    if (lockedOrders.length !== orderIds.length) {
      fail("Uno de los pedidos ya no existe.", "not_found");
    }
    const ordersById = new Map(lockedOrders.map((order) => [order.id, order]));
    for (const source of parsedSources) {
      const order = ordersById.get(source.orderId)!;
      if (order.revision !== source.expectedOrderRevision) {
        fail("Un pedido cambió en otra sesión. Recargá la página.", "conflict");
      }
    }

    const baseIds = parsedSources
      .filter((source) => source.type === "base")
      .map((source) => source.id);
    const adjustmentIds = parsedSources
      .filter((source) => source.type === "adjustment")
      .map((source) => source.id);

    const baseLines =
      baseIds.length === 0
        ? []
        : await tx
            .select()
            .from(orderItems)
            .where(inArray(orderItems.id, baseIds));
    const baseLinesById = new Map(baseLines.map((line) => [line.id, line]));

    const allAddedRows =
      adjustmentIds.length === 0
        ? []
        : await tx
            .select({
              orderId: orderAdjustments.orderId,
              item: orderAdjustmentItems,
            })
            .from(orderAdjustmentItems)
            .innerJoin(
              orderAdjustments,
              eq(orderAdjustmentItems.adjustmentId, orderAdjustments.id),
            )
            .where(
              and(
                inArray(orderAdjustments.orderId, orderIds),
                isNull(orderAdjustmentItems.baseOrderItemId),
              ),
            );
    const addedById = new Map(allAddedRows.map((row) => [row.item.id, row]));

    const changedOrderIds = new Set<number>();
    const previousByOrder = new Map<
      number,
      { sourceKeys: string[]; previousCategories: StoreCategory[] }
    >();
    let changedSources = 0;
    let unchangedSources = 0;

    for (const source of parsedSources) {
      if (source.type === "base") {
        const line = baseLinesById.get(source.id);
        if (!line || line.orderId !== source.orderId) {
          fail(
            "Una línea seleccionada ya no pertenece al pedido.",
            "not_found",
          );
        }
        if (line.storeCategoryAtPurchase !== source.expectedCategory) {
          fail(
            "Una línea cambió de categoría en otra sesión. Recargá la página.",
            "conflict",
          );
        }
        if (line.storeCategoryAtPurchase === input.targetCategory) {
          unchangedSources += 1;
          continue;
        }
        await tx
          .update(orderItems)
          .set({ storeCategoryAtPurchase: input.targetCategory })
          .where(eq(orderItems.id, line.id));
        // Linked deltas mirror their base line; leaving them behind would
        // split one effective line across two categories.
        await tx
          .update(orderAdjustmentItems)
          .set({ storeCategorySnapshot: input.targetCategory })
          .where(eq(orderAdjustmentItems.baseOrderItemId, line.id));
        changedSources += 1;
        changedOrderIds.add(source.orderId);
        const audit = previousByOrder.get(source.orderId) ?? {
          sourceKeys: [],
          previousCategories: [],
        };
        audit.sourceKeys.push(source.sourceKey);
        audit.previousCategories.push(line.storeCategoryAtPurchase);
        previousByOrder.set(source.orderId, audit);
        continue;
      }

      const representative = addedById.get(source.id);
      if (
        !representative ||
        representative.orderId !== source.orderId ||
        representative.item.baseOrderItemId != null
      ) {
        fail("Una línea seleccionada ya no pertenece al pedido.", "not_found");
      }
      if (
        representative.item.storeCategorySnapshot !== source.expectedCategory
      ) {
        fail(
          "Una línea cambió de categoría en otra sesión. Recargá la página.",
          "conflict",
        );
      }
      if (representative.item.storeCategorySnapshot === input.targetCategory) {
        unchangedSources += 1;
        continue;
      }
      const groupKey = getAddedLineGroupKey(
        toProjectionLine(representative.item),
      );
      const groupIds = allAddedRows
        .filter(
          (row) =>
            row.orderId === source.orderId &&
            getAddedLineGroupKey(toProjectionLine(row.item)) === groupKey,
        )
        .map((row) => row.item.id);
      await tx
        .update(orderAdjustmentItems)
        .set({ storeCategorySnapshot: input.targetCategory })
        .where(inArray(orderAdjustmentItems.id, groupIds));
      changedSources += 1;
      changedOrderIds.add(source.orderId);
      const audit = previousByOrder.get(source.orderId) ?? {
        sourceKeys: [],
        previousCategories: [],
      };
      audit.sourceKeys.push(source.sourceKey);
      audit.previousCategories.push(representative.item.storeCategorySnapshot);
      previousByOrder.set(source.orderId, audit);
    }

    for (const orderId of [...changedOrderIds].sort((a, b) => a - b)) {
      const order = ordersById.get(orderId)!;
      const revision = order.revision + 1;
      const audit = previousByOrder.get(orderId)!;
      await tx
        .update(orders)
        .set({ revision, updatedAt: sql`now()` })
        .where(eq(orders.id, orderId));
      await tx.insert(orderEvents).values({
        orderId,
        type: "category_corrected",
        revision,
        actorId: input.actorUserId,
        payload: {
          reason,
          targetCategory: input.targetCategory,
          sourceKeys: audit.sourceKeys,
          previousCategories: audit.previousCategories,
          sourceCount: audit.sourceKeys.length,
        },
      });
    }

    return {
      changedSources,
      unchangedSources,
      changedOrders: changedOrderIds.size,
    };
  });
}
