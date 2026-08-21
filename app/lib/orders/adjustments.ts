import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import {
  orderAdjustmentItems,
  orderAdjustments,
  orderEvents,
  orderItems,
  orders,
  products,
  productVariants,
} from "@/db/schema";
import { db } from "@/db";
import {
  consumeLineStockInTx,
  restoreLineStockInTx,
} from "@/app/lib/rentals/order-stock";

type OrderTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type OrderItemAdjustment = {
  baseOrderItemId: number;
  quantityDelta: number;
};

export type ApplyOrderAdjustmentInput = {
  orderId: number;
  actorUserId: number;
  actorRole: "admin" | "customer";
  expectedRevision: number;
  reason: string;
  customerNote?: string | null;
  allowedStatuses: readonly (typeof orders.$inferSelect)["status"][];
  items: readonly OrderItemAdjustment[];
};

export type ApplyOrderAdjustmentResult = {
  adjustmentId: number;
  revision: number;
  previousTotal: number;
  totalDelta: number;
  newTotal: number;
};

function fail(message: string, cause: string): never {
  throw Object.assign(new Error(message), { cause });
}

/**
 * Applies deltas to immutable order lines. Authorization belongs to the
 * action/controller that calls this server-only primitive.
 */
export async function applyOrderAdjustment(
  input: ApplyOrderAdjustmentInput,
): Promise<ApplyOrderAdjustmentResult> {
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
    fail("La revisión del pedido es inválida.", "invalid_input");
  }
  if (!input.reason.trim())
    fail("Debes indicar el motivo del ajuste.", "invalid_input");

  const deltas = new Map<number, number>();
  for (const item of input.items) {
    if (
      !Number.isInteger(item.baseOrderItemId) ||
      !Number.isInteger(item.quantityDelta)
    ) {
      fail("El ajuste contiene cantidades inválidas.", "invalid_input");
    }
    if (item.quantityDelta !== 0) {
      deltas.set(
        item.baseOrderItemId,
        (deltas.get(item.baseOrderItemId) ?? 0) + item.quantityDelta,
      );
    }
  }
  const changedItems = [...deltas].filter(
    ([, quantityDelta]) => quantityDelta !== 0,
  );
  if (changedItems.length === 0)
    fail("No hay cambios para aplicar.", "invalid_input");

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .for("update");
    if (!order) fail("Pedido no encontrado.", "not_found");
    if (!input.allowedStatuses.includes(order.status)) {
      fail("Este pedido ya no permite ajustes de artículos.", "locked");
    }
    if (order.revision !== input.expectedRevision) {
      fail("El pedido cambió en otra sesión. Recargá la página.", "conflict");
    }

    const itemIds = changedItems.map(([id]) => id);
    const baseLines = await tx
      .select()
      .from(orderItems)
      .where(
        and(eq(orderItems.orderId, order.id), inArray(orderItems.id, itemIds)),
      );
    if (baseLines.length !== itemIds.length) {
      fail(
        "El ajuste incluye un artículo que no pertenece al pedido.",
        "forbidden",
      );
    }

    const quantityRows = await tx
      .select({
        baseOrderItemId: orderAdjustmentItems.baseOrderItemId,
        quantityDelta: sql<number>`cast(coalesce(sum(${orderAdjustmentItems.quantityDelta}), 0) as integer)`,
      })
      .from(orderAdjustmentItems)
      .innerJoin(
        orderAdjustments,
        eq(orderAdjustmentItems.adjustmentId, orderAdjustments.id),
      )
      .where(
        and(
          eq(orderAdjustments.orderId, order.id),
          inArray(orderAdjustmentItems.baseOrderItemId, itemIds),
        ),
      )
      .groupBy(orderAdjustmentItems.baseOrderItemId);
    const priorDeltas = new Map(
      quantityRows
        .filter(
          (row): row is { baseOrderItemId: number; quantityDelta: number } =>
            row.baseOrderItemId != null,
        )
        .map((row) => [row.baseOrderItemId, Number(row.quantityDelta)]),
    );

    const linesById = new Map(baseLines.map((line) => [line.id, line]));
    for (const [baseOrderItemId, quantityDelta] of changedItems) {
      const line = linesById.get(baseOrderItemId)!;
      const effectiveQuantity =
        line.quantity + (priorDeltas.get(baseOrderItemId) ?? 0) + quantityDelta;
      if (effectiveQuantity < 0) {
        fail(
          "El ajuste no puede dejar una cantidad negativa.",
          "invalid_quantity",
        );
      }
    }

    const productIds = [
      ...new Set(baseLines.map((line) => line.productId)),
    ].sort((a, b) => a - b);
    const variantIds = [
      ...new Set(
        baseLines
          .map((line) => line.productVariantId)
          .filter((id): id is number => id != null),
      ),
    ].sort((a, b) => a - b);
    const lockedProducts = await tx
      .select()
      .from(products)
      .where(inArray(products.id, productIds))
      .orderBy(products.id)
      .for("update");
    const lockedVariants =
      variantIds.length === 0
        ? []
        : await tx
            .select()
            .from(productVariants)
            .where(inArray(productVariants.id, variantIds))
            .orderBy(productVariants.id)
            .for("update");
    const productsById = new Map(
      lockedProducts.map((product) => [product.id, product]),
    );
    const variantsById = new Map(
      lockedVariants.map((variant) => [variant.id, variant]),
    );

    const totalDelta = changedItems.reduce(
      (total, [baseOrderItemId, quantityDelta]) => {
        return (
          total +
          linesById.get(baseOrderItemId)!.priceAtPurchase * quantityDelta
        );
      },
      0,
    );
    const previousTotal = order.totalAmount;
    const newTotal = previousTotal + totalDelta;
    const [adjustment] = await tx
      .insert(orderAdjustments)
      .values({
        orderId: order.id,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        reason: input.reason.trim(),
        customerNote: input.customerNote?.trim() || null,
        previousTotal,
        totalDelta,
        newTotal,
      })
      .returning();

    for (const [baseOrderItemId, quantityDelta] of changedItems) {
      const line = linesById.get(baseOrderItemId)!;
      await tx.insert(orderAdjustmentItems).values({
        adjustmentId: adjustment.id,
        baseOrderItemId,
        productId: line.productId,
        productVariantId: line.productVariantId,
        productNameSnapshot: line.productNameAtPurchase ?? "Producto",
        variantLabelSnapshot: line.productVariantLabel,
        transactionType: line.transactionType,
        quantityDelta,
        unitPriceSnapshot: line.priceAtPurchase,
        unitCostSnapshot: line.unitCostAtPurchase,
      });

      if (quantityDelta < 0) {
        await restoreLineStockInTx(tx, { ...line, quantity: -quantityDelta });
        continue;
      }
      const product = productsById.get(line.productId);
      const variant =
        line.productVariantId == null
          ? null
          : (variantsById.get(line.productVariantId) ?? null);
      if (
        !product ||
        (line.productVariantId != null &&
          (!variant || variant.productId !== line.productId))
      ) {
        fail("El producto del pedido ya no está disponible.", "not_found");
      }
      await consumeLineStockInTx(
        tx,
        product,
        variant ?? null,
        quantityDelta,
        line.transactionType,
        line.rentalStockModeSnapshot,
      );
    }

    const revision = order.revision + 1;
    await tx
      .update(orders)
      .set({ totalAmount: newTotal, revision, updatedAt: sql`now()` })
      .where(eq(orders.id, order.id));
    await tx.insert(orderEvents).values({
      orderId: order.id,
      type: "adjusted",
      revision,
      actorId: input.actorUserId,
      adjustmentId: adjustment.id,
      payload: { reason: input.reason.trim(), totalDelta, newTotal },
    });

    return {
      adjustmentId: adjustment.id,
      revision,
      previousTotal,
      totalDelta,
      newTotal,
    };
  });
}
