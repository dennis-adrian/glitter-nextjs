import { and, eq, sql } from "drizzle-orm";

import { getRentalOutstandingQuantity } from "@/app/lib/rentals/status";
import {
  getAvailableStockForTransaction,
  getStockPoolForTransaction,
} from "@/app/lib/rentals/stock";
import type { ProductTransactionType } from "@/app/lib/rentals/types";
import { db } from "@/db";
import { orderItems, productVariants, products } from "@/db/schema";

type OrderTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ProductRow = typeof products.$inferSelect;
type VariantRow = typeof productVariants.$inferSelect;
type OrderItemRow = typeof orderItems.$inferSelect;

function throwInsufficientStock(productName?: string): never {
  throw new Error(
    productName
      ? `Stock insuficiente para ${productName}.`
      : "Stock insuficiente.",
    { cause: "stock_insufficient" },
  );
}

async function decrementVariantRentalStock(
  tx: OrderTx,
  variantId: number,
  quantity: number,
) {
  const [updated] = await tx
    .update(productVariants)
    .set({
      rentalStock: sql`COALESCE(${productVariants.rentalStock}, 0) - ${quantity}`,
    })
    .where(
      and(
        eq(productVariants.id, variantId),
        sql`COALESCE(${productVariants.rentalStock}, 0) >= ${quantity}`,
      ),
    )
    .returning({ id: productVariants.id });

  if (!updated) throwInsufficientStock();
}

async function decrementProductRentalStock(
  tx: OrderTx,
  productId: number,
  quantity: number,
) {
  const [updated] = await tx
    .update(products)
    .set({
      rentalStock: sql`COALESCE(${products.rentalStock}, 0) - ${quantity}`,
    })
    .where(
      and(
        eq(products.id, productId),
        sql`COALESCE(${products.rentalStock}, 0) >= ${quantity}`,
      ),
    )
    .returning({ id: products.id });

  if (!updated) throwInsufficientStock();
}

async function decrementVariantSaleStock(
  tx: OrderTx,
  variantId: number,
  quantity: number,
) {
  const [updated] = await tx
    .update(productVariants)
    .set({
      stock: sql`COALESCE(${productVariants.stock}, 0) - ${quantity}`,
    })
    .where(
      and(
        eq(productVariants.id, variantId),
        sql`COALESCE(${productVariants.stock}, 0) >= ${quantity}`,
      ),
    )
    .returning({ id: productVariants.id });

  if (!updated) throwInsufficientStock();
}

async function decrementProductSaleStock(
  tx: OrderTx,
  productId: number,
  quantity: number,
) {
  const [updated] = await tx
    .update(products)
    .set({
      stock: sql`COALESCE(${products.stock}, 0) - ${quantity}`,
    })
    .where(
      and(
        eq(products.id, productId),
        sql`COALESCE(${products.stock}, 0) >= ${quantity}`,
      ),
    )
    .returning({ id: products.id });

  if (!updated) throwInsufficientStock();
}

export async function consumeLineStockInTx(
  tx: OrderTx,
  product: ProductRow,
  variant: VariantRow | null,
  quantity: number,
  transactionType: ProductTransactionType,
) {
  const pool = getStockPoolForTransaction(product, transactionType);

  if (pool === "rental") {
    if (variant) {
      await decrementVariantRentalStock(tx, variant.id, quantity);
      return;
    }
    await decrementProductRentalStock(tx, product.id, quantity);
    return;
  }

  if (variant) {
    await decrementVariantSaleStock(tx, variant.id, quantity);
    return;
  }

  await decrementProductSaleStock(tx, product.id, quantity);
}

export async function restoreLineStockInTx(
  tx: OrderTx,
  item: Pick<
    OrderItemRow,
    | "productId"
    | "productVariantId"
    | "quantity"
    | "transactionType"
    | "rentalStockModeSnapshot"
    | "rentalReturnedQuantity"
  >,
) {
  const quantityToRestore =
    item.transactionType === "rental"
      ? getRentalOutstandingQuantity({
          quantity: item.quantity,
          rentalReturnedQuantity: item.rentalReturnedQuantity,
        })
      : item.quantity;

  if (quantityToRestore <= 0) return;

  const stockPool =
    item.transactionType === "rental"
      ? (item.rentalStockModeSnapshot ?? "shared")
      : "shared";

  if (item.transactionType === "rental" && stockPool === "separate") {
    if (item.productVariantId != null) {
      await tx
        .update(productVariants)
        .set({
          rentalStock: sql`COALESCE(${productVariants.rentalStock}, 0) + ${quantityToRestore}`,
        })
        .where(eq(productVariants.id, item.productVariantId));
      return;
    }

    await tx
      .update(products)
      .set({
        rentalStock: sql`COALESCE(${products.rentalStock}, 0) + ${quantityToRestore}`,
      })
      .where(eq(products.id, item.productId));
    return;
  }

  if (item.productVariantId != null) {
    await tx
      .update(productVariants)
      .set({
        stock: sql`COALESCE(${productVariants.stock}, 0) + ${quantityToRestore}`,
      })
      .where(eq(productVariants.id, item.productVariantId));
    return;
  }

  await tx
    .update(products)
    .set({
      stock: sql`COALESCE(${products.stock}, 0) + ${quantityToRestore}`,
    })
    .where(eq(products.id, item.productId));
}

export function getAvailableStockForLine(
  product: ProductRow,
  variant: VariantRow | null,
  transactionType: ProductTransactionType,
): number {
  return getAvailableStockForTransaction(product, variant, transactionType);
}

export function validateCombinedSharedStockDemand(
  lines: Array<{
    productId: number;
    productVariantId: number | null;
    quantity: number;
    transactionType: ProductTransactionType;
  }>,
  product: ProductRow,
  variant: VariantRow | null,
): number {
  const sharedDemand = lines
    .filter((line) => {
      if (line.productId !== product.id) return false;
      const lineVariantId = line.productVariantId ?? null;
      const targetVariantId = variant?.id ?? null;
      if (lineVariantId !== targetVariantId) return false;
      return (
        getStockPoolForTransaction(product, line.transactionType) === "sale"
      );
    })
    .reduce((sum, line) => sum + line.quantity, 0);

  const available = variant?.stock ?? product.stock ?? 0;
  return available - sharedDemand;
}
