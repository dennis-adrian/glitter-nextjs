import "server-only";

import { eq, inArray, sql } from "drizzle-orm";

import { restoreLineStockInTx } from "@/app/lib/rentals/order-stock";
import { db } from "@/db";
import {
  orderAdjustmentItems,
  orderAdjustments,
  orderItems,
  products,
  productVariants,
} from "@/db/schema";

type OrderTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function restoreEffectiveOrderStockInTx(
  tx: OrderTx,
  orderId: number,
) {
  await restoreEffectiveOrdersStockInTx(tx, [orderId]);
}

export async function restoreEffectiveOrdersStockInTx(
  tx: OrderTx,
  orderIds: readonly number[],
) {
  if (orderIds.length === 0) return;
  const baseItems = await tx
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds));
  const deltaRows = await tx
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
  const deltas = new Map(
    deltaRows
      .filter((row) => row.baseOrderItemId != null)
      .map((row) => [row.baseOrderItemId!, Number(row.quantityDelta)]),
  );
  const effectiveItems = baseItems
    .map((item) => ({
      ...item,
      quantity: item.quantity + (deltas.get(item.id) ?? 0),
    }))
    .filter((item) => item.quantity > 0);

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
