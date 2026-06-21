"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getRentalOutstandingQuantity } from "@/app/lib/rentals/status";
import type {
  MarkRentalReturnResult,
  RentalReturnCondition,
} from "@/app/lib/rentals/types";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  orderItems,
  orders,
  productVariants,
  products,
  rentalReturnLogs,
} from "@/db/schema";

type OrderTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function fetchRentalReturnLogs(input: {
  orderItemId?: number;
  orderId?: number;
}) {
  if (input.orderItemId != null) {
    return db.query.rentalReturnLogs.findMany({
      where: eq(rentalReturnLogs.orderItemId, input.orderItemId),
      orderBy: (logs, { desc }) => [desc(logs.createdAt)],
      with: {
        processedBy: {
          columns: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  if (input.orderId != null) {
    return db.query.rentalReturnLogs.findMany({
      where: eq(rentalReturnLogs.orderId, input.orderId),
      orderBy: (logs, { desc }) => [desc(logs.createdAt)],
      with: {
        processedBy: {
          columns: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  return [];
}

async function restoreRentalStockInTx(
  tx: OrderTx,
  input: {
    productId: number;
    productVariantId: number | null;
    quantity: number;
    stockPool: "shared" | "separate";
  },
) {
  if (input.stockPool === "separate") {
    if (input.productVariantId != null) {
      await tx
        .update(productVariants)
        .set({
          rentalStock: sql`COALESCE(${productVariants.rentalStock}, 0) + ${input.quantity}`,
        })
        .where(eq(productVariants.id, input.productVariantId));
      return;
    }

    await tx
      .update(products)
      .set({
        rentalStock: sql`COALESCE(${products.rentalStock}, 0) + ${input.quantity}`,
      })
      .where(eq(products.id, input.productId));
    return;
  }

  if (input.productVariantId != null) {
    await tx
      .update(productVariants)
      .set({
        stock: sql`COALESCE(${productVariants.stock}, 0) + ${input.quantity}`,
      })
      .where(eq(productVariants.id, input.productVariantId));
    return;
  }

  await tx
    .update(products)
    .set({
      stock: sql`COALESCE(${products.stock}, 0) + ${input.quantity}`,
    })
    .where(eq(products.id, input.productId));
}

export async function markRentalOrderItemReturned(
  orderItemId: number,
  payload: {
    quantityReturned: number;
    conditionStatus: RentalReturnCondition;
    notes?: string | null;
  },
): Promise<MarkRentalReturnResult> {
  const admin = await getCurrentUserProfile();
  if (!admin || admin.role !== "admin") {
    return {
      success: false,
      error: "forbidden",
      message: "No autorizado.",
    };
  }

  if (payload.quantityReturned <= 0) {
    return {
      success: false,
      error: "invalid_quantity",
      message: "La cantidad devuelta debe ser mayor a 0.",
    };
  }

  if (
    payload.conditionStatus !== "good" &&
    !payload.notes?.trim()
  ) {
    return {
      success: false,
      error: "notes_required",
      message: "Las notas son requeridas cuando la condición no es buena.",
    };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.id, orderItemId))
        .for("update");

      if (!item) {
        return {
          success: false as const,
          error: "not_found",
          message: "Ítem de orden no encontrado.",
        };
      }

      if (item.transactionType !== "rental") {
        return {
          success: false as const,
          error: "not_rental",
          message: "Solo los ítems de alquiler pueden devolverse.",
        };
      }

      const outstanding = getRentalOutstandingQuantity({
        quantity: item.quantity,
        rentalReturnedQuantity: item.rentalReturnedQuantity,
      });

      if (outstanding <= 0) {
        return {
          success: false as const,
          error: "already_returned",
          message: "Este ítem ya fue devuelto por completo.",
        };
      }

      if (payload.quantityReturned > outstanding) {
        return {
          success: false as const,
          error: "invalid_quantity",
          message: "La cantidad devuelta excede lo pendiente.",
        };
      }

      const stockPool = item.rentalStockModeSnapshot ?? "shared";
      const previousReturnedQuantity = item.rentalReturnedQuantity;
      const newReturnedQuantity =
        previousReturnedQuantity + payload.quantityReturned;

      await restoreRentalStockInTx(tx, {
        productId: item.productId,
        productVariantId: item.productVariantId,
        quantity: payload.quantityReturned,
        stockPool,
      });

      await tx
        .update(orderItems)
        .set({
          rentalReturnedQuantity: newReturnedQuantity,
          updatedAt: new Date(),
        })
        .where(eq(orderItems.id, orderItemId));

      const [order] = await tx
        .select({
          customerName: orders.guestName,
          userId: orders.userId,
        })
        .from(orders)
        .where(eq(orders.id, item.orderId))
        .limit(1);

      const [product] = await tx
        .select({ name: products.name })
        .from(products)
        .where(eq(products.id, item.productId))
        .limit(1);

      await tx.insert(rentalReturnLogs).values({
        orderItemId: item.id,
        orderId: item.orderId,
        productId: item.productId,
        productVariantId: item.productVariantId,
        quantityReturned: payload.quantityReturned,
        conditionStatus: payload.conditionStatus,
        notes: payload.notes?.trim() || null,
        stockRestored: payload.quantityReturned,
        stockPool,
        processedByUserId: admin.id,
        previousReturnedQuantity,
        newReturnedQuantity,
        productNameSnapshot: product?.name ?? null,
        variantLabelSnapshot: item.productVariantLabel,
        customerNameSnapshot: order?.customerName ?? null,
      });

      return {
        success: true as const,
        orderId: item.orderId,
        returnedQuantity: payload.quantityReturned,
        outstandingQuantity: outstanding - payload.quantityReturned,
      };
    });

    if (result.success) {
      revalidatePath("/dashboard/store/orders");
      revalidatePath(`/dashboard/store/orders/${result.orderId}`);
      revalidatePath("/dashboard/store/rentals");
    }

    return result as MarkRentalReturnResult;
  } catch (error) {
    console.error(error);
    return {
      success: false,
      error: "stock_update_failed",
      message: "No se pudo procesar la devolución.",
    };
  }
}

export async function fetchCurrentRentals() {
  const rows = await db
    .select({
      orderItemId: orderItems.id,
      productId: orderItems.productId,
      productName: products.name,
      productVariantId: orderItems.productVariantId,
      productVariantLabel: orderItems.productVariantLabel,
      quantity: orderItems.quantity,
      rentalReturnedQuantity: orderItems.rentalReturnedQuantity,
      orderId: orderItems.orderId,
      rentalFestivalId: orderItems.rentalFestivalId,
      rentalReservationId: orderItems.rentalReservationId,
      rentedAt: orderItems.createdAt,
      orderUserId: orders.userId,
      orderGuestName: orders.guestName,
      orderStatus: orders.status,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(
      and(
        eq(orderItems.transactionType, "rental"),
        sql`${orderItems.rentalReturnedQuantity} < ${orderItems.quantity}`,
        sql`${orders.status} <> 'cancelled'`,
      ),
    );

  return rows.map((row) => ({
    ...row,
    quantityOut: row.quantity - row.rentalReturnedQuantity,
  }));
}
