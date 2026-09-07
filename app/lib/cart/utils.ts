import { CartItemWithProduct } from "@/app/lib/cart/definitions";
import {
  getAvailableStockForTransaction,
  getTransactionPoolRemainingStock,
} from "@/app/lib/rentals/stock";
import {
  getProductVariantStock,
  productHasVariants,
} from "@/app/lib/products/variants";

export function buildCartLineKey(
  productId: number,
  productVariantId: number | null | undefined,
  transactionType: "purchase" | "rental" = "purchase",
): string {
  return `${productId}:${productVariantId ?? "base"}:${transactionType}`;
}

function isInvalidCartVariantLine(item: CartItemWithProduct): boolean {
  if (!productHasVariants(item.product)) {
    return false;
  }

  if (item.productVariantId == null || item.variant == null) {
    return true;
  }

  return !item.variant.isVisible;
}

export function getCartItemAvailableStock(
  item: CartItemWithProduct,
  allItems: CartItemWithProduct[],
): number {
  if (isInvalidCartVariantLine(item)) {
    return 0;
  }

  return getTransactionPoolRemainingStock(
    item.product,
    item.variant,
    item.transactionType,
    allItems.map((entry) => ({
      id: entry.id,
      productId: entry.productId,
      productVariantId: entry.productVariantId,
      transactionType: entry.transactionType,
      quantity: entry.quantity,
    })),
    {
      id: item.id,
      productId: item.productId,
      productVariantId: item.productVariantId,
    },
  );
}

export function getCartItemWarnings(
  item: CartItemWithProduct,
  allItems: CartItemWithProduct[] = [item],
): {
  isOutOfStock: boolean;
  quantityExceedsStock: boolean;
  availableStock: number;
} {
  if (isInvalidCartVariantLine(item)) {
    return {
      isOutOfStock: true,
      quantityExceedsStock: false,
      availableStock: 0,
    };
  }

  const stock = getCartItemAvailableStock(item, allItems);
  return {
    isOutOfStock: stock === 0,
    quantityExceedsStock: stock > 0 && item.quantity > stock,
    availableStock: stock,
  };
}

/** @deprecated Use getCartItemAvailableStock for cart UI with shared-pool awareness */
export function getLegacyCartItemStock(item: CartItemWithProduct): number {
  return getAvailableStockForTransaction(
    item.product,
    item.variant,
    item.transactionType,
  );
}

export function getGuestCartItemStock(
  item: Pick<CartItemWithProduct, "product" | "variant">,
): number {
  return getProductVariantStock(item.product, item.variant);
}
