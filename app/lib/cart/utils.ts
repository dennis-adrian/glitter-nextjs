import type {
  GuestBundleInput,
  GuestCartItemInput,
  GuestCartResolution,
} from "@/app/lib/cart/actions";
import type {
  CartItemWithProduct,
  GuestCartBundle,
  GuestCartItem,
} from "@/app/lib/cart/definitions";
import { MAX_CART_LINE_QUANTITY } from "@/app/lib/constants";
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

/** Told when equal bundle lines merge past the per-line limit. */
export const MERGED_BUNDLE_LINES_NOTICE = `Juntamos las líneas iguales de este combo. Podés llevar hasta ${MAX_CART_BUNDLE_QUANTITY} unidades.`;

/**
 * Replaces one guest bundle line with `next`, whose key may differ (a line is
 * re-keyed once its choices are known to be canonical). A line already under
 * that key at the same version absorbs it, up to the per-line limit; one that
 * still waits for a price confirmation stays apart, so a merge never confirms
 * a version on the customer's behalf. Reports the units the limit left out.
 */
export function replaceGuestBundleLine(
  bundles: readonly GuestCartBundle[],
  lineKey: string,
  next: GuestCartBundle,
): { bundles: GuestCartBundle[]; droppedUnits: number } {
  const current = bundles.find((bundle) => bundle.lineKey === lineKey);
  if (!current) return { bundles: [...bundles], droppedUnits: 0 };
  const holder = bundles.find(
    (bundle) => bundle.lineKey === next.lineKey && bundle !== current,
  );
  if (!holder) {
    return {
      bundles: bundles.map((bundle) => (bundle === current ? next : bundle)),
      droppedUnits: 0,
    };
  }
  if (holder.bundleVersion !== next.bundleVersion) {
    return {
      bundles: bundles.map((bundle) =>
        bundle === current
          ? { ...next, lineKey, selections: current.selections }
          : bundle,
      ),
      droppedUnits: 0,
    };
  }
  const combined = holder.quantity + next.quantity;
  const quantity = Math.min(combined, MAX_CART_BUNDLE_QUANTITY);
  return {
    bundles: bundles.flatMap((bundle) =>
      bundle === current
        ? []
        : bundle === holder
          ? [{ ...next, quantity }]
          : [bundle],
    ),
    droppedUnits: combined - quantity,
  };
}

/**
 * Applies a server resolution to guest bundle lines: drops lines whose bundle
 * was deleted and re-keys resolved lines canonically, merging equal ones.
 * Unchanged lines come back as the same array, so state keeps its identity.
 */
export function reconcileGuestBundleLines(
  bundles: GuestCartBundle[],
  resolution: Pick<GuestCartResolution, "bundles" | "removedBundleKeys">,
): { bundles: GuestCartBundle[]; droppedUnits: number } {
  const removed = new Set(resolution.removedBundleKeys);
  // Lines waiting for a price confirmation keep their key until accepted.
  const rekeys = resolution.bundles.filter(
    (line) =>
      line.issue !== "stale" &&
      line.issue !== "unavailable" &&
      line.issue !== "selection_invalid" &&
      buildBundleLineKey(line.bundleId, line.selections) !== line.key,
  );
  let updated = bundles.filter((bundle) => !removed.has(bundle.lineKey));
  let changed = updated.length !== bundles.length;
  let droppedUnits = 0;
  for (const line of rekeys) {
    const current = updated.find((bundle) => bundle.lineKey === line.key);
    if (!current) continue;
    const lineKey = buildBundleLineKey(line.bundleId, line.selections);
    const holder = updated.find((bundle) => bundle.lineKey === lineKey);
    // The key belongs to a line still awaiting confirmation; they merge once
    // it is accepted.
    if (holder && holder.bundleVersion !== current.bundleVersion) continue;
    const replaced = replaceGuestBundleLine(updated, line.key, {
      ...current,
      lineKey,
      selections: line.selections,
    });
    updated = replaced.bundles;
    droppedUnits += replaced.droppedUnits;
    changed = true;
  }
  return { bundles: changed ? updated : bundles, droppedUnits };
}

/** Units of one product (or variant) the guest's bundle lines take. */
export function getGuestBundleUnits(
  bundles: readonly GuestCartBundle[],
  productId: number,
  productVariantId: number | null,
): number {
  // Snapshots saved before components carried their ids count nothing here;
  // the server's resolution still counts them.
  return bundles.reduce(
    (sum, bundle) =>
      sum +
      bundle.components.reduce(
        (units, component) =>
          component.productId === productId &&
          (component.productVariantId ?? null) === productVariantId
            ? units + component.quantity * bundle.quantity
            : units,
        0,
      ),
    0,
  );
}

/**
 * Units a guest line may hold by the stock snapshot it carries, once the
 * guest's bundle lines take their share of the same stock.
 */
export function getGuestItemStockCap(
  item: Pick<
    GuestCartItem,
    "productId" | "productVariantId" | "product" | "variant"
  >,
  bundles: readonly GuestCartBundle[],
): number {
  const stock = item.variant?.stock ?? item.product.stock;
  if (stock == null) return MAX_CART_LINE_QUANTITY;
  return Math.max(
    0,
    stock - getGuestBundleUnits(bundles, item.productId, item.productVariantId),
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
      productId: component.productId,
      productVariantId: component.productVariantId,
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
