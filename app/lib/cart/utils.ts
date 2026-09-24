import type {
  GuestBundleInput,
  GuestCartItemInput,
} from "@/app/lib/cart/actions";
import type {
  CartItemWithProduct,
  GuestCartBundle,
  GuestCartItem,
} from "@/app/lib/cart/definitions";
import type {
  BundleSelectionInput,
  CartBundleLine,
} from "@/app/lib/merch/bundle-definitions";
import { buildBundleSelectionKey } from "@/app/lib/merch/bundle-pricing";
import { MAX_CART_BUNDLE_QUANTITY } from "@/app/lib/merch/bundle-schema";
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

/** What the server needs from guest bundle lines: identity and choices. */
export function toGuestBundleInputs(
  bundles: readonly GuestCartBundle[],
): GuestBundleInput[] {
  return bundles.map((bundle) => ({
    lineKey: bundle.lineKey,
    bundleId: bundle.bundleId,
    bundleVersion: bundle.bundleVersion,
    quantity: bundle.quantity,
    selections: bundle.selections,
  }));
}

export function toGuestItemInputs(
  items: readonly GuestCartItem[],
): GuestCartItemInput[] {
  return items.map((item) => ({
    lineKey: item.lineKey,
    productId: item.productId,
    productVariantId: item.productVariantId,
    quantity: item.quantity,
  }));
}

/**
 * Replaces one guest bundle line with `next`, whose key may differ (a line is
 * re-keyed once its choices are known to be canonical). A line already under
 * that key at the same version absorbs it, up to the per-line limit; one that
 * still waits for a price confirmation stays apart, so a merge never confirms
 * a version on the customer's behalf.
 */
export function replaceGuestBundleLine(
  bundles: readonly GuestCartBundle[],
  lineKey: string,
  next: GuestCartBundle,
): GuestCartBundle[] {
  const current = bundles.find((bundle) => bundle.lineKey === lineKey);
  if (!current) return [...bundles];
  const holder = bundles.find(
    (bundle) => bundle.lineKey === next.lineKey && bundle !== current,
  );
  if (!holder) {
    return bundles.map((bundle) => (bundle === current ? next : bundle));
  }
  if (holder.bundleVersion !== next.bundleVersion) {
    return bundles.map((bundle) =>
      bundle === current
        ? { ...next, lineKey, selections: current.selections }
        : bundle,
    );
  }
  const quantity = Math.min(
    holder.quantity + next.quantity,
    MAX_CART_BUNDLE_QUANTITY,
  );
  return bundles.flatMap((bundle) =>
    bundle === current
      ? []
      : bundle === holder
        ? [{ ...next, quantity }]
        : [bundle],
  );
}

/** Notice shown after bundles the admin deleted leave a guest cart. */
export function removedBundlesNotice(count: number): string {
  return count === 1
    ? "Quitamos de tu carrito un combo que ya no existe."
    : `Quitamos de tu carrito ${count} combos que ya no existen.`;
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
