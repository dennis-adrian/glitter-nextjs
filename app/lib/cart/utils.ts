import type {
  CartItemWithProduct,
  GuestCartBundle,
} from "@/app/lib/cart/definitions";
import type {
  BundleSelectionInput,
  CartBundleLine,
} from "@/app/lib/merch/bundle-definitions";
import { buildBundleSelectionKey } from "@/app/lib/merch/bundle-pricing";
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

/** Purchase demand of bundle lines, shaped like sibling cart lines. */
export type BundleDemandLine = {
  productId: number;
  productVariantId: number | null;
  transactionType: "purchase";
  quantity: number;
};

export function getBundleDemandLines(
  bundles: readonly Pick<CartBundleLine, "components" | "quantity">[],
): BundleDemandLine[] {
  return bundles.flatMap((bundle) =>
    bundle.components.map((component) => ({
      productId: component.productId,
      productVariantId: component.productVariantId,
      transactionType: "purchase" as const,
      quantity: component.quantity * bundle.quantity,
    })),
  );
}

export function buildBundleLineKey(
  bundleId: number,
  selections: readonly BundleSelectionInput[],
): string {
  return `bundle:${bundleId}:${buildBundleSelectionKey(selections)}`;
}

/** Guest cart snapshot of a resolved bundle line. */
export function toGuestCartBundle(
  line: CartBundleLine,
  overrides: Partial<Pick<GuestCartBundle, "quantity" | "bundleVersion">> = {},
): GuestCartBundle {
  return {
    lineKey: buildBundleLineKey(line.bundleId, line.selections),
    bundleId: line.bundleId,
    bundleVersion: overrides.bundleVersion ?? line.bundleVersion,
    quantity: overrides.quantity ?? line.quantity,
    selections: line.selections,
    name: line.name,
    slug: line.slug,
    imageUrl: line.imageUrl,
    unitPriceCents: line.unitPriceCents,
    separateUnitPriceCents: line.separateUnitPriceCents,
    components: line.components.map((component) => ({
      productName: component.productName,
      variantLabel: component.variantLabel,
      quantity: component.quantity,
      imageUrl: component.imageUrl,
    })),
  };
}

export function getCartItemAvailableStock(
  item: CartItemWithProduct,
  allItems: CartItemWithProduct[],
  bundleDemand: readonly BundleDemandLine[] = [],
): number {
  if (isInvalidCartVariantLine(item)) {
    return 0;
  }

  return getTransactionPoolRemainingStock(
    item.product,
    item.variant,
    item.transactionType,
    [
      ...allItems.map((entry) => ({
        id: entry.id,
        productId: entry.productId,
        productVariantId: entry.productVariantId,
        transactionType: entry.transactionType,
        quantity: entry.quantity,
      })),
      ...bundleDemand,
    ],
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
  bundleDemand: readonly BundleDemandLine[] = [],
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

  const stock = getCartItemAvailableStock(item, allItems, bundleDemand);
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
