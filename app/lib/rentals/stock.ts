import type {
  ProductRentalStockMode,
  ProductTransactionType,
} from "@/app/lib/rentals/types";
import type { BaseProduct, BaseProductVariant } from "@/app/lib/products/definitions";

type ProductStockFields = Pick<
  BaseProduct,
  "stock" | "rentalStock" | "rentalStockMode"
>;
type VariantStockFields = Pick<BaseProductVariant, "stock" | "rentalStock">;

export function getStockPoolForTransaction(
  product: ProductStockFields,
  transactionType: ProductTransactionType,
): "sale" | "rental" {
  if (transactionType === "purchase") return "sale";
  return product.rentalStockMode === "separate" ? "rental" : "sale";
}

export function getAvailableStockForTransaction(
  product: ProductStockFields,
  variant: VariantStockFields | null | undefined,
  transactionType: ProductTransactionType,
): number {
  const pool = getStockPoolForTransaction(product, transactionType);
  if (pool === "rental") {
    if (variant) return variant.rentalStock ?? 0;
    return product.rentalStock ?? 0;
  }
  if (variant) return variant.stock ?? 0;
  return product.stock ?? 0;
}

export function usesSharedRentalStock(product: ProductStockFields): boolean {
  return product.rentalStockMode === "shared";
}

export function getCombinedSharedStockDemand(
  lines: { transactionType: ProductTransactionType; quantity: number }[],
): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

type SharedDemandLine = {
  id?: number;
  productId: number;
  productVariantId: number | null;
  transactionType: ProductTransactionType;
  quantity: number;
};

export function getSharedPoolRemainingStock(
  product: ProductStockFields,
  variant: VariantStockFields | null | undefined,
  transactionType: ProductTransactionType,
  siblingLines: SharedDemandLine[],
  currentLine: Pick<SharedDemandLine, "id" | "productId" | "productVariantId">,
): number {
  const poolStock = getAvailableStockForTransaction(
    product,
    variant,
    transactionType,
  );

  if (!usesSharedRentalStock(product)) {
    return poolStock;
  }

  const currentVariantId = currentLine.productVariantId ?? null;
  const sharedDemand = siblingLines
    .filter((line) => {
      if (line.id != null && line.id === currentLine.id) return false;
      if (line.productId !== currentLine.productId) return false;
      const lineVariantId = line.productVariantId ?? null;
      if (lineVariantId !== currentVariantId) return false;
      return getStockPoolForTransaction(product, line.transactionType) === "sale";
    })
    .reduce((sum, line) => sum + line.quantity, 0);

  return Math.max(0, poolStock - sharedDemand);
}

export function getSeparatePoolLineCap(
  poolStock: number,
  siblingLines: SharedDemandLine[],
  transactionType: ProductTransactionType,
  currentLine: Pick<SharedDemandLine, "id" | "productId" | "productVariantId">,
): number {
  const currentVariantId = currentLine.productVariantId ?? null;
  const demand = siblingLines
    .filter((line) => {
      if (line.id != null && line.id === currentLine.id) return false;
      if (line.productId !== currentLine.productId) return false;
      if ((line.productVariantId ?? null) !== currentVariantId) return false;
      return line.transactionType === transactionType;
    })
    .reduce((sum, line) => sum + line.quantity, 0);

  return Math.max(0, poolStock - demand);
}

export function getTransactionPoolRemainingStock(
  product: ProductStockFields & { id?: number },
  variant: VariantStockFields | null | undefined,
  transactionType: ProductTransactionType,
  siblingLines: SharedDemandLine[],
  currentLine: Pick<SharedDemandLine, "id" | "productId" | "productVariantId">,
): number {
  if (usesSharedRentalStock(product)) {
    return getSharedPoolRemainingStock(
      product,
      variant,
      transactionType,
      siblingLines,
      currentLine,
    );
  }

  const poolStock = getAvailableStockForTransaction(
    product,
    variant,
    transactionType,
  );

  return getSeparatePoolLineCap(
    poolStock,
    siblingLines,
    transactionType,
    currentLine,
  );
}

export function isSeparatePoolOrderQuantityValid(
  product: ProductStockFields,
  variant: VariantStockFields | null | undefined,
  transactionType: ProductTransactionType,
  quantity: number,
): boolean {
  const usesSharedPool =
    getStockPoolForTransaction(product, transactionType) === "sale";
  if (usesSharedPool) return true;

  const availableStock = getAvailableStockForTransaction(
    product,
    variant,
    transactionType,
  );
  return quantity <= availableStock;
}

export function resolveRentalStockModeSnapshot(
  product: ProductStockFields,
  transactionType: ProductTransactionType,
): ProductRentalStockMode | null {
  if (transactionType !== "rental") return null;
  return product.rentalStockMode;
}
