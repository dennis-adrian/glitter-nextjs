import "server-only";

import { eq, inArray, sql } from "drizzle-orm";

import type { OrderStatus } from "@/app/lib/orders/definitions";
import { getEffectiveOrderLines } from "@/app/lib/orders/projection";
import { canCancelOrderStatus } from "@/app/lib/orders/status-transitions";
import { restoreLineStockInTx } from "@/app/lib/rentals/order-stock";
import { db } from "@/db";
import {
  orderAdjustmentItems,
  orderAdjustments,
  orderEvents,
  orderItems,
  orders,
  products,
  productVariants,
} from "@/db/schema";

type OrderTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type BaseItemRow = typeof orderItems.$inferSelect;
type AdjustmentItemRow = typeof orderAdjustmentItems.$inferSelect;

/** Stock-restoration shape; category is irrelevant to how much comes back. */
export type RestorableOrderLine = Pick<
  BaseItemRow,
  | "productId"
  | "productVariantId"
  | "quantity"
  | "transactionType"
  | "rentalStockModeSnapshot"
  | "rentalReturnedQuantity"
>;

/**
 * Pure projection of the units a cancellation must return to stock. Added
 * lines go through `getEffectiveOrderLines`, so they group by the same
 * identity as everywhere else — category included.
 */
export function projectRestorableOrderLines(
  orderIds: readonly number[],
  baseItems: readonly BaseItemRow[],
  adjustmentRows: readonly { orderId: number; item: AdjustmentItemRow }[],
): RestorableOrderLine[] {
  const deltas = adjustmentRows
    .filter((row) => row.item.baseOrderItemId != null)
    .reduce((map, row) => {
      map.set(
        row.item.baseOrderItemId!,
        (map.get(row.item.baseOrderItemId!) ?? 0) + row.item.quantityDelta,
      );
      return map;
    }, new Map<number, number>());
  const effectiveBaseItems = baseItems
    .map((item) => ({
      ...item,
      quantity: item.quantity + (deltas.get(item.id) ?? 0),
    }))
    .filter((item) => item.quantity > 0);
  const effectiveAddedItems = orderIds.flatMap((orderId) =>
    getEffectiveOrderLines(
      [],
      adjustmentRows
        .filter(
          (row) => row.orderId === orderId && row.item.baseOrderItemId == null,
        )
        .map((row) => row.item),
    ).map((line) => ({
      productId: line.productId,
      productVariantId: line.productVariantId,
      quantity: line.quantity,
      transactionType: line.transactionType,
      rentalStockModeSnapshot: null,
      rentalReturnedQuantity: 0,
    })),
  );

  return [...effectiveBaseItems, ...effectiveAddedItems];
}

export async function restoreEffectiveOrderStockInTx(
  tx: OrderTx,
  orderId: number,
) {
  await restoreEffectiveOrdersStockInTx(tx, [orderId]);
}

async function loadRestorableOrderLines(
  tx: OrderTx,
  orderIds: readonly number[],
) {
  const baseItems = await tx
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds));
  const adjustmentRows = await tx
    .select({
      orderId: orderAdjustments.orderId,
      item: orderAdjustmentItems,
    })
    .from(orderAdjustmentItems)
    .innerJoin(
      orderAdjustments,
      eq(orderAdjustmentItems.adjustmentId, orderAdjustments.id),
    )
    .where(inArray(orderAdjustments.orderId, orderIds));
  return projectRestorableOrderLines(orderIds, baseItems, adjustmentRows);
}

export async function restoreEffectiveOrdersStockInTx(
  tx: OrderTx,
  orderIds: readonly number[],
) {
  if (orderIds.length === 0) return;
  const effectiveItems = await loadRestorableOrderLines(tx, orderIds);

  const productIds = [
    ...new Set(effectiveItems.map((item) => item.productId)),
  ].sort((a, b) => a - b);
  const variantIds = [
    ...new Set(
      effectiveItems
        .map((item) => item.productVariantId)
        .filter((id): id is number => id != null),
    ),
  ].sort((a, b) => a - b);
  if (productIds.length > 0) {
    await tx
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.id, productIds))
      .orderBy(products.id)
      .for("update");
  }
  if (variantIds.length > 0) {
    await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(inArray(productVariants.id, variantIds))
      .orderBy(productVariants.id)
      .for("update");
  }

  for (const item of effectiveItems) await restoreLineStockInTx(tx, item);
}

/**
 * Cancels an order that has no effective lines left, the way an admin
 * cancellation does: status, a new revision and a `cancelled` event. It
 * checks the same projection a cancellation restores stock from, so an empty
 * order has nothing to restore: the adjustments that emptied it already
 * returned every unit. Returns the new revision, or null when lines remain or
 * the status cannot be cancelled. The caller holds the order row lock.
 */
export async function cancelEmptyOrderInTx(
  tx: OrderTx,
  input: {
    orderId: number;
    status: OrderStatus;
    revision: number;
    actorId: number | null;
    reason: string;
  },
): Promise<number | null> {
  if (!canCancelOrderStatus(input.status)) return null;
  const remaining = await loadRestorableOrderLines(tx, [input.orderId]);
  if (remaining.length > 0) return null;

  const revision = input.revision + 1;
  await tx
    .update(orders)
    .set({ status: "cancelled", revision, updatedAt: sql`now()` })
    .where(eq(orders.id, input.orderId));
  await tx.insert(orderEvents).values({
    orderId: input.orderId,
    type: "cancelled",
    revision,
    actorId: input.actorId,
    payload: {
      previousStatus: input.status,
      status: "cancelled",
      reason: input.reason,
    },
  });
  return revision;
}
