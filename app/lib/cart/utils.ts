import { CartItemWithProduct } from "@/app/lib/cart/definitions";
import {
  getProductVariantStock,
  productHasVariants,
} from "@/app/lib/products/variants";

export function buildCartLineKey(
  productId: number,
  productVariantId: number | null | undefined,
): string {
  return `${productId}:${productVariantId ?? "base"}`;
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

export function getCartItemWarnings(item: CartItemWithProduct): {
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

  const stock = getProductVariantStock(item.product, item.variant);
  // Only treat explicit stock === 0 as out-of-stock; null/undefined = unknown = allow checkout (consistent with cart-item-row)
  return {
    isOutOfStock: stock === 0,
    quantityExceedsStock:
      typeof stock === "number" && stock > 0 && item.quantity > stock,
    availableStock: stock ?? 0,
  };
}
