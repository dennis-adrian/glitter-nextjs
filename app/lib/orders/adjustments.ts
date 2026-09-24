import "server-only";

import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { cancelEmptyOrderInTx } from "@/app/lib/orders/cancellation";
import {
  getAddedLineGroupKey,
  type ProjectionAdjustmentLine,
} from "@/app/lib/orders/projection";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import type { StoreCategory } from "@/app/lib/store/category";
import { resolveUnitCost } from "@/app/lib/products/cost";
import { getVariantLabel } from "@/app/lib/products/variants";
import {
  consumeLineStockInTx,
  restoreLineStockInTx,
} from "@/app/lib/rentals/order-stock";
import { db } from "@/db";
import {
  orderAdjustmentItems,
  orderAdjustments,
  orderEvents,
  orderItems,
  orderReturnItems,
  orderReturns,
  orders,
  products,
  productVariantOptionValues,
  productVariants,
} from "@/db/schema";

type BaseLine = typeof orderItems.$inferSelect;
type AddedLine = typeof orderAdjustmentItems.$inferSelect;

export type OrderItemAdjustment = {
  baseOrderItemId: number;
  quantityDelta: number;
};

export type AddedOrderItemAdjustment = {
  adjustmentItemId: number;
  quantityDelta: number;
};

export type NewOrderItemAddition = {
  productId: number;
  productVariantId: number | null;
  quantity: number;
};

export type OrderReturnCreation = {
  status: "received";
  reason: string;
  items: readonly {
    orderItemId: number | null;
    productId: number;
    productVariantId: number | null;
    productNameSnapshot: string;
    variantLabelSnapshot: string | null;
    quantity: number;
    unitPriceSnapshot: number;
    unitCostSnapshot: number | null;
  }[];
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
  addedItems?: readonly AddedOrderItemAdjustment[];
  additions?: readonly NewOrderItemAddition[];
  orderReturn?: OrderReturnCreation;
  /**
   * Cancel the order in the same transaction when the adjustment leaves it
   * without lines. Customer edits use it; admins decide for themselves.
   */
  cancelWhenEmpty?: boolean;
};

export type ApplyOrderAdjustmentResult = {
  adjustmentId: number;
  revision: number;
  previousTotal: number;
  totalDelta: number;
  newTotal: number;
  /** The adjustment emptied the order and `cancelWhenEmpty` cancelled it. */
  cancelled: boolean;
};

type ResolvedChange = {
  baseOrderItemId: number | null;
  productId: number;
  productVariantId: number | null;
  productNameSnapshot: string;
  variantLabelSnapshot: string | null;
  transactionType: "purchase" | "rental";
  storeCategorySnapshot: StoreCategory;
  quantityDelta: number;
  unitPriceSnapshot: number;
  unitCostSnapshot: number | null;
  rentalStockModeSnapshot: "shared" | "separate" | null;
  rentalReturnedQuantity: number;
};

function fail(message: string, cause: string): never {
  throw Object.assign(new Error(message), { cause });
}

/**
 * Integer cents of an amount, rounded the way a numeric(10, 2) column stores
 * it: drizzle sends the number's shortest decimal text and Postgres rounds
 * that text half away from zero. Checkout stores its float total this way, so
 * a delta rounded the same way reconciles with it. 50.00000000000001 becomes
 * 5000, 84.915 becomes 8492, and 1.275 becomes 128 where
 * `Math.round(1.275 * 100)` gives 127.
 */
export function toStoredCents(amount: number): number {
  if (!Number.isFinite(amount)) {
    fail("El monto del ajuste es inválido.", "invalid_input");
  }
  const text = Math.abs(amount).toString();
  // Exponent notation only appears below a millionth, which rounds to zero,
  // or far above what numeric(10, 2) can hold.
  if (text.includes("e")) return Math.round(amount * 100) || 0;
  const [whole, fraction = ""] = text.split(".");
  const cents =
    Number(whole) * 100 +
    Number(fraction.slice(0, 2).padEnd(2, "0")) +
    (Number(fraction[2] ?? 0) >= 5 ? 1 : 0);
  return amount < 0 && cents > 0 ? -cents : cents;
}

function aggregateIntegerDeltas<T>(
  rows: readonly T[],
  getId: (row: T) => number,
  getDelta: (row: T) => number,
) {
  const values = new Map<number, number>();
  for (const row of rows) {
    const id = getId(row);
    const delta = getDelta(row);
    if (!Number.isInteger(id) || !Number.isInteger(delta)) {
      fail("El ajuste contiene cantidades inválidas.", "invalid_input");
    }
    if (delta !== 0) values.set(id, (values.get(id) ?? 0) + delta);
  }
  return new Map([...values].filter(([, delta]) => delta !== 0));
}

function toProjectionLine(line: AddedLine): ProjectionAdjustmentLine {
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

/** Applies immutable deltas. Authorization belongs to the calling action. */
export async function applyOrderAdjustment(
  input: ApplyOrderAdjustmentInput,
): Promise<ApplyOrderAdjustmentResult> {
  return applyOrderAdjustmentWithDatabase(db, input);
}

/** Database seam used by integration tests; application callers use the wrapper above. */
export async function applyOrderAdjustmentWithDatabase(
  database: typeof db,
  input: ApplyOrderAdjustmentInput,
): Promise<ApplyOrderAdjustmentResult> {
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
    fail("La revisión del pedido es inválida.", "invalid_input");
  }
  if (!input.reason.trim())
    fail("Debes indicar el motivo del ajuste.", "invalid_input");

  const baseDeltas = aggregateIntegerDeltas(
    input.items,
    (item) => item.baseOrderItemId,
    (item) => item.quantityDelta,
  );
  const addedDeltasById = aggregateIntegerDeltas(
    input.addedItems ?? [],
    (item) => item.adjustmentItemId,
    (item) => item.quantityDelta,
  );
  const additionsByKey = new Map<string, NewOrderItemAddition>();
  for (const addition of input.additions ?? []) {
    if (
      !Number.isInteger(addition.productId) ||
      (addition.productVariantId != null &&
        !Number.isInteger(addition.productVariantId)) ||
      !Number.isInteger(addition.quantity) ||
      addition.quantity <= 0
    ) {
      fail("Los productos agregados son inválidos.", "invalid_input");
    }
    const key = `${addition.productId}:${addition.productVariantId ?? "base"}`;
    const existing = additionsByKey.get(key);
    if (existing) existing.quantity += addition.quantity;
    else additionsByKey.set(key, { ...addition });
  }
  const additions = [...additionsByKey.values()];
  if (
    baseDeltas.size === 0 &&
    addedDeltasById.size === 0 &&
    additions.length === 0
  ) {
    fail("No hay cambios para aplicar.", "invalid_input");
  }

  return database.transaction(async (tx) => {
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

    const baseItemIds = [...baseDeltas.keys()];
    // Every line of the order, not only the adjusted ones: the new total
    // depends on whether anything is left to pay.
    const orderLines: BaseLine[] = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    const baseLines = orderLines.filter((line) => baseDeltas.has(line.id));
    if (baseLines.length !== baseItemIds.length) {
      fail(
        "El ajuste incluye un artículo que no pertenece al pedido.",
        "forbidden",
      );
    }

    const priorBaseRows = await tx
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
          isNotNull(orderAdjustmentItems.baseOrderItemId),
        ),
      )
      .groupBy(orderAdjustmentItems.baseOrderItemId);
    const priorBaseDeltas = new Map(
      priorBaseRows
        .filter((row) => row.baseOrderItemId != null)
        .map((row) => [row.baseOrderItemId!, Number(row.quantityDelta)]),
    );
    const baseLinesById = new Map(baseLines.map((line) => [line.id, line]));
    for (const [baseOrderItemId, quantityDelta] of baseDeltas) {
      const line = baseLinesById.get(baseOrderItemId)!;
      const effectiveQuantity =
        line.quantity +
        (priorBaseDeltas.get(baseOrderItemId) ?? 0) +
        quantityDelta;
      if (effectiveQuantity < 0) {
        fail(
          "El ajuste no puede dejar una cantidad negativa.",
          "invalid_quantity",
        );
      }
      if (
        line.transactionType === "rental" &&
        effectiveQuantity < line.rentalReturnedQuantity
      ) {
        fail(
          "El ajuste no puede reducir un alquiler por debajo de la cantidad ya devuelta.",
          "invalid_quantity",
        );
      }
    }

    const requestedAddedIds = [...addedDeltasById.keys()];
    const allAddedRows = await tx
      .select({ item: orderAdjustmentItems })
      .from(orderAdjustmentItems)
      .innerJoin(
        orderAdjustments,
        eq(orderAdjustmentItems.adjustmentId, orderAdjustments.id),
      )
      .where(
        and(
          eq(orderAdjustments.orderId, order.id),
          isNull(orderAdjustmentItems.baseOrderItemId),
        ),
      );
    const allAddedLines = allAddedRows.map((row) => row.item);
    const addedLinesById = new Map(
      allAddedLines.map((line) => [line.id, line]),
    );
    if (requestedAddedIds.some((id) => !addedLinesById.has(id))) {
      fail(
        "El ajuste incluye un artículo agregado que no pertenece al pedido.",
        "forbidden",
      );
    }
    const currentAddedQuantities = new Map<string, number>();
    // The group key includes the unit price, so each group has exactly one.
    const addedGroupUnitPrices = new Map<string, number>();
    for (const line of allAddedLines) {
      const key = getAddedLineGroupKey(toProjectionLine(line));
      currentAddedQuantities.set(
        key,
        (currentAddedQuantities.get(key) ?? 0) + line.quantityDelta,
      );
      addedGroupUnitPrices.set(key, line.unitPriceSnapshot);
    }
    const addedGroupChanges = new Map<
      string,
      { representative: AddedLine; quantityDelta: number }
    >();
    for (const [adjustmentItemId, quantityDelta] of addedDeltasById) {
      const representative = addedLinesById.get(adjustmentItemId)!;
      const key = getAddedLineGroupKey(toProjectionLine(representative));
      const current = addedGroupChanges.get(key);
      if (current) current.quantityDelta += quantityDelta;
      else addedGroupChanges.set(key, { representative, quantityDelta });
    }
    for (const [key, change] of addedGroupChanges) {
      if ((currentAddedQuantities.get(key) ?? 0) + change.quantityDelta < 0) {
        fail(
          "El ajuste no puede dejar una cantidad negativa.",
          "invalid_quantity",
        );
      }
    }

    const resourceProductIds = [
      ...new Set([
        ...baseLines.map((line) => line.productId),
        ...[...addedGroupChanges.values()].map(
          ({ representative }) => representative.productId,
        ),
        ...additions.map((line) => line.productId),
      ]),
    ].sort((a, b) => a - b);
    const resourceVariantIds = [
      ...new Set(
        [
          ...baseLines.map((line) => line.productVariantId),
          ...[...addedGroupChanges.values()].map(
            ({ representative }) => representative.productVariantId,
          ),
          ...additions.map((line) => line.productVariantId),
        ].filter((id): id is number => id != null),
      ),
    ].sort((a, b) => a - b);
    const lockedProducts = await tx
      .select()
      .from(products)
      .where(inArray(products.id, resourceProductIds))
      .orderBy(products.id)
      .for("update");
    const lockedVariants =
      resourceVariantIds.length === 0
        ? []
        : await tx
            .select()
            .from(productVariants)
            .where(inArray(productVariants.id, resourceVariantIds))
            .orderBy(productVariants.id)
            .for("update");
    if (lockedProducts.length !== resourceProductIds.length) {
      fail("Uno de los productos ya no está disponible.", "not_found");
    }
    if (lockedVariants.length !== resourceVariantIds.length) {
      fail("Una de las variantes ya no está disponible.", "not_found");
    }
    const productsById = new Map(
      lockedProducts.map((product) => [product.id, product]),
    );
    const variantsById = new Map(
      lockedVariants.map((variant) => [variant.id, variant]),
    );

    const newProductIds = [...new Set(additions.map((line) => line.productId))];
    const productsWithVariants =
      newProductIds.length === 0
        ? new Set<number>()
        : new Set(
            (
              await tx
                .select({ productId: productVariants.productId })
                .from(productVariants)
                .where(inArray(productVariants.productId, newProductIds))
            ).map((row) => row.productId),
          );
    const newVariantIds = additions
      .map((line) => line.productVariantId)
      .filter((id): id is number => id != null);
    const variantSelections =
      newVariantIds.length === 0
        ? []
        : await tx.query.productVariantOptionValues.findMany({
            where: inArray(productVariantOptionValues.variantId, newVariantIds),
            with: { option: true, optionValue: true },
          });
    const selectionsByVariantId = new Map<number, typeof variantSelections>();
    for (const selection of variantSelections) {
      const values = selectionsByVariantId.get(selection.variantId) ?? [];
      values.push(selection);
      selectionsByVariantId.set(selection.variantId, values);
    }

    const changes: ResolvedChange[] = [];
    for (const [baseOrderItemId, quantityDelta] of baseDeltas) {
      const line = baseLinesById.get(baseOrderItemId)!;
      changes.push({
        baseOrderItemId,
        productId: line.productId,
        productVariantId: line.productVariantId,
        productNameSnapshot:
          line.productNameAtPurchase ??
          productsById.get(line.productId)?.name ??
          "Producto",
        variantLabelSnapshot: line.productVariantLabel,
        transactionType: line.transactionType,
        storeCategorySnapshot: line.storeCategoryAtPurchase,
        quantityDelta,
        unitPriceSnapshot: line.priceAtPurchase,
        unitCostSnapshot: line.unitCostAtPurchase,
        rentalStockModeSnapshot: line.rentalStockModeSnapshot,
        rentalReturnedQuantity: line.rentalReturnedQuantity,
      });
    }
    for (const {
      representative,
      quantityDelta,
    } of addedGroupChanges.values()) {
      if (quantityDelta === 0) continue;
      changes.push({
        baseOrderItemId: null,
        productId: representative.productId,
        productVariantId: representative.productVariantId,
        productNameSnapshot: representative.productNameSnapshot,
        variantLabelSnapshot: representative.variantLabelSnapshot,
        transactionType: representative.transactionType,
        storeCategorySnapshot: representative.storeCategorySnapshot,
        quantityDelta,
        unitPriceSnapshot: representative.unitPriceSnapshot,
        unitCostSnapshot: representative.unitCostSnapshot,
        rentalStockModeSnapshot: null,
        rentalReturnedQuantity: 0,
      });
    }
    for (const addition of additions) {
      const product = productsById.get(addition.productId)!;
      if (!product.isPurchasable) {
        fail(`${product.name} no está disponible para compra.`, "unavailable");
      }
      const variant =
        addition.productVariantId == null
          ? null
          : (variantsById.get(addition.productVariantId) ?? null);
      if (
        addition.productVariantId != null &&
        (!variant || variant.productId !== product.id)
      ) {
        fail("La variante no pertenece al producto.", "forbidden");
      }
      if (variant && !variant.isVisible) {
        fail(`${product.name} - variante no disponible.`, "unavailable");
      }
      if (!variant && productsWithVariants.has(product.id)) {
        fail(
          `${product.name} requiere seleccionar una variante.`,
          "variant_required",
        );
      }
      changes.push({
        baseOrderItemId: null,
        productId: product.id,
        productVariantId: variant?.id ?? null,
        productNameSnapshot: product.name,
        variantLabelSnapshot: variant
          ? (getVariantLabel({
              selections: selectionsByVariantId.get(variant.id) ?? [],
            }) ?? null)
          : null,
        transactionType: "purchase",
        storeCategorySnapshot: product.storeCategory,
        quantityDelta: addition.quantity,
        // The snapshot column holds cents, so the total uses the price it
        // stores; removing the line later then takes back exactly what it added.
        unitPriceSnapshot:
          toStoredCents(getProductPriceAtPurchase(product, variant)) / 100,
        unitCostSnapshot: resolveUnitCost(product.unitCost, variant?.unitCost),
        rentalStockModeSnapshot: null,
        rentalReturnedQuantity: 0,
      });
    }
    if (changes.length === 0)
      fail("No hay cambios para aplicar.", "invalid_input");

    // Checkout rounds its float total once, so the float delta is rounded
    // once too, not per unit: 2 × 10.625 is 21.25 on both sides, where per
    // unit it would be 21.26 against 21.25 paid. Rounding is not additive
    // (nor is a float4 unit price exactly checkout's), so a partial change
    // can still drift a cent; an adjustment that leaves nothing to pay
    // therefore takes the order to exactly zero, even when free lines remain.
    const changeAmount = changes.reduce(
      (total, line) => total + line.quantityDelta * line.unitPriceSnapshot,
      0,
    );
    // What the remaining lines charge for: every line before this change at
    // its unit price, plus the change itself (lines it adds included).
    const remainingAmount =
      orderLines.reduce(
        (total, line) =>
          total +
          (line.quantity + (priorBaseDeltas.get(line.id) ?? 0)) *
            line.priceAtPurchase,
        0,
      ) +
      [...currentAddedQuantities].reduce(
        (total, [key, quantity]) =>
          total + quantity * addedGroupUnitPrices.get(key)!,
        0,
      ) +
      changeAmount;
    const leavesNothingToPay = toStoredCents(remainingAmount) === 0;
    const previousTotal = order.totalAmount;
    const previousTotalCents = toStoredCents(previousTotal);
    const totalDeltaCents = leavesNothingToPay
      ? -previousTotalCents || 0
      : toStoredCents(changeAmount);
    const newTotalCents = previousTotalCents + totalDeltaCents;
    if (newTotalCents < 0)
      fail("El total del pedido no puede ser negativo.", "invalid_input");
    const totalDelta = totalDeltaCents / 100;
    const newTotal = newTotalCents / 100;
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

    await tx.insert(orderAdjustmentItems).values(
      changes.map((line) => ({
        adjustmentId: adjustment.id,
        baseOrderItemId: line.baseOrderItemId,
        productId: line.productId,
        productVariantId: line.productVariantId,
        productNameSnapshot: line.productNameSnapshot,
        variantLabelSnapshot: line.variantLabelSnapshot,
        transactionType: line.transactionType,
        storeCategorySnapshot: line.storeCategorySnapshot,
        quantityDelta: line.quantityDelta,
        unitPriceSnapshot: line.unitPriceSnapshot,
        unitCostSnapshot: line.unitCostSnapshot,
      })),
    );

    for (const line of [...changes].sort(
      (a, b) => a.quantityDelta - b.quantityDelta,
    )) {
      if (line.quantityDelta < 0) {
        await restoreLineStockInTx(tx, {
          productId: line.productId,
          productVariantId: line.productVariantId,
          quantity: -line.quantityDelta,
          transactionType: line.transactionType,
          rentalStockModeSnapshot: line.rentalStockModeSnapshot,
          // Restore the full reduced qty; returned units were already restored
          // on return and must not be subtracted again here.
          rentalReturnedQuantity: 0,
        });
        continue;
      }
      await consumeLineStockInTx(
        tx,
        productsById.get(line.productId)!,
        line.productVariantId == null
          ? null
          : (variantsById.get(line.productVariantId) ?? null),
        line.quantityDelta,
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
      payload: {
        reason: input.reason.trim(),
        totalDelta,
        newTotal,
        addedLines: additions.length,
      },
    });
    if (input.customerNote?.trim()) {
      await tx.insert(orderEvents).values({
        orderId: order.id,
        type: "note_added",
        revision,
        actorId: input.actorUserId,
        adjustmentId: adjustment.id,
        payload: {
          note: input.customerNote.trim(),
          customerVisible: true,
        },
      });
    }

    if (input.orderReturn) {
      const [returnRecord] = await tx
        .insert(orderReturns)
        .values({
          orderId: order.id,
          adjustmentId: adjustment.id,
          actorUserId: input.actorUserId,
          status: input.orderReturn.status,
          reason: input.orderReturn.reason,
          refundAmount: Math.abs(totalDelta),
        })
        .returning({ id: orderReturns.id });
      await tx.insert(orderReturnItems).values(
        input.orderReturn.items.map((item) => ({
          returnId: returnRecord.id,
          orderId: order.id,
          orderItemId: item.orderItemId,
          productId: item.productId,
          productVariantId: item.productVariantId,
          productNameSnapshot: item.productNameSnapshot,
          variantLabelSnapshot: item.variantLabelSnapshot,
          quantity: item.quantity,
          unitPriceSnapshot: item.unitPriceSnapshot,
          unitCostSnapshot: item.unitCostSnapshot,
        })),
      );
    }

    const cancelledRevision = input.cancelWhenEmpty
      ? await cancelEmptyOrderInTx(tx, {
          orderId: order.id,
          status: order.status,
          revision,
          actorId: input.actorUserId,
          reason: "emptied_by_adjustment",
        })
      : null;

    return {
      adjustmentId: adjustment.id,
      revision: cancelledRevision ?? revision,
      previousTotal,
      totalDelta,
      newTotal,
      cancelled: cancelledRevision != null,
    };
  });
}
