export const DEFAULT_LOW_STOCK_THRESHOLD = 5;
export const LOW_STOCK_FILTER_PARAM = "stock";
export const LOW_STOCK_FILTER_VALUE = "low";

type StockLevel = {
  stock: number;
  lowStockThreshold: number | null;
};

type ProductStockLevel = {
  stock: number | null;
  lowStockThreshold: number | null;
  variants?: (StockLevel & { isVisible: boolean })[];
};

export function isLowStockLevel({
  stock,
  lowStockThreshold,
}: StockLevel): boolean {
  return lowStockThreshold !== null && stock <= lowStockThreshold;
}

export function isProductLowStock(product: ProductStockLevel): boolean {
  if ((product.variants?.length ?? 0) > 0) {
    return (
      product.variants?.some(
        (variant) => variant.isVisible && isLowStockLevel(variant),
      ) ?? false
    );
  }

  return isLowStockLevel({
    stock: product.stock ?? 0,
    lowStockThreshold: product.lowStockThreshold,
  });
}

export function isLowStockFilter(
  value: string | string[] | undefined,
): boolean {
  return (Array.isArray(value) ? value[0] : value) === LOW_STOCK_FILTER_VALUE;
}
