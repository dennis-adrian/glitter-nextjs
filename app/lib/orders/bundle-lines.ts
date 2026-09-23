import "server-only";

import { asc, inArray } from "drizzle-orm";

import type {
  BundleCatalogProduct,
  BundleRecord,
  BundleSelectionInput,
  ResolvedBundleComponent,
} from "@/app/lib/merch/bundle-definitions";
import {
  allocateBundlePrice,
  evaluateBundle,
  resolveBundleSelection,
} from "@/app/lib/merch/bundle-pricing";
import { MAX_CART_BUNDLE_QUANTITY } from "@/app/lib/merch/bundle-schema";
import { loadBundleRecords } from "@/app/lib/merch/bundles";
import { db } from "@/db";
import { merchBundles } from "@/db/schema";

type OrderTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A bundle line as submitted from a cart. Prices never come from clients. */
export type BundleOrderRequest = {
  bundleId: number;
  bundleVersion: number;
  quantity: number;
  selections: BundleSelectionInput[];
};

export type ResolvedOrderBundle = {
  bundleId: number;
  bundleVersion: number;
  name: string;
  slug: string;
  imageUrl: string | null;
  quantity: number;
  unitPriceCents: number;
  separateUnitPriceCents: number;
  components: ResolvedBundleComponent[];
};

export type PlannedBundleOrderItem = {
  component: ResolvedBundleComponent;
  unitsPerBundle: number;
  unitListCents: number;
  paidUnitCents: number;
};

function fail(message: string, cause: string): never {
  throw new Error(message, { cause });
}

/**
 * Share-locks the requested bundles (in id order) so an admin edit cannot
 * change price or contents between validation and order creation.
 */
export async function lockBundleRecordsForCheckout(
  tx: OrderTx,
  requests: readonly BundleOrderRequest[],
): Promise<BundleRecord[]> {
  const ids = [...new Set(requests.map((request) => request.bundleId))].sort(
    (a, b) => a - b,
  );
  if (ids.length === 0) return [];
  await tx
    .select({ id: merchBundles.id })
    .from(merchBundles)
    .where(inArray(merchBundles.id, ids))
    .orderBy(asc(merchBundles.id))
    .for("share");
  return loadBundleRecords(tx, { ids });
}

/** Every product and variant a bundle line may touch, for locking. */
export function bundleLockTargets(records: readonly BundleRecord[]) {
  return {
    productIds: records.flatMap((record) =>
      record.components.map((component) => component.productId),
    ),
    variantIds: records.flatMap((record) =>
      record.components.flatMap((component) => component.variantIds),
    ),
  };
}

/**
 * Re-prices bundle lines from locked catalog rows. Rejects unpublished,
 * invalid or no-longer-discounted bundles, stale versions and bad choices.
 */
export function resolveOrderBundles(
  requests: readonly BundleOrderRequest[],
  records: readonly BundleRecord[],
  catalog: ReadonlyMap<number, BundleCatalogProduct>,
): ResolvedOrderBundle[] {
  const recordsById = new Map(records.map((record) => [record.id, record]));
  return requests.map((request) => {
    if (
      !Number.isInteger(request.quantity) ||
      request.quantity <= 0 ||
      request.quantity > MAX_CART_BUNDLE_QUANTITY
    ) {
      fail("La cantidad del combo es inválida.", "invalid_quantity");
    }
    const record = recordsById.get(request.bundleId);
    if (!record || !record.isVisible) {
      fail("Un combo de tu carrito ya no está disponible.", "bundle_unavailable");
    }
    const evaluation = evaluateBundle(record, catalog, { mode: "sale" });
    if (evaluation.issues.length > 0) {
      fail(
        `El combo "${record.name}" ya no está disponible.`,
        "bundle_unavailable",
      );
    }
    if (record.version !== request.bundleVersion) {
      fail(
        `El combo "${record.name}" cambió. Revisá tu carrito antes de confirmar.`,
        "bundle_changed",
      );
    }
    const selection = resolveBundleSelection(evaluation, request.selections);
    if (!selection.ok) {
      fail(`${record.name}: ${selection.message}`, "bundle_changed");
    }
    if (evaluation.priceCents >= selection.separateCents) {
      fail(
        `El combo "${record.name}" ya no está disponible.`,
        "bundle_unavailable",
      );
    }
    return {
      bundleId: record.id,
      bundleVersion: record.version,
      name: record.name,
      slug: record.slug,
      imageUrl: record.imageUrl ?? selection.components[0]?.imageUrl ?? null,
      quantity: request.quantity,
      unitPriceCents: evaluation.priceCents,
      separateUnitPriceCents: selection.separateCents,
      components: selection.components,
    };
  });
}

/** Sale-stock demand of resolved bundles, as purchase order lines. */
export function bundleDemandLines(bundles: readonly ResolvedOrderBundle[]) {
  return bundles.flatMap((bundle) =>
    bundle.components.map((component) => ({
      productId: component.productId,
      productVariantId: component.productVariantId,
      quantity: component.quantity * bundle.quantity,
      transactionType: "purchase" as const,
    })),
  );
}

/**
 * Splits one bundle's price across its component units (see
 * `allocateBundlePrice`). Every copy of the bundle gets the same allocation,
 * so each returned tier becomes one order line of `unitsPerBundle × quantity`.
 */
export function planBundleOrderItems(
  bundle: ResolvedOrderBundle,
): PlannedBundleOrderItem[] {
  const tiers = allocateBundlePrice(
    bundle.unitPriceCents,
    bundle.components.map((component, index) => ({
      key: String(index),
      unitListCents: component.unitPriceCents,
      units: component.quantity,
    })),
  );
  return tiers.map((tier) => ({
    component: bundle.components[Number(tier.key)],
    unitsPerBundle: tier.units,
    unitListCents: tier.unitListCents,
    paidUnitCents: tier.paidUnitCents,
  }));
}

/** Email/receipt entry describing one bundle line of an order. */
export function describeOrderBundle(bundle: ResolvedOrderBundle) {
  const presale = bundle.components.filter(
    (component) => component.productStatus === "presale",
  );
  const availableDates = presale
    .map((component) => component.productAvailableDate)
    .filter((date): date is Date => date != null);
  return {
    id: bundle.bundleId,
    name: `Combo ${bundle.name}`,
    quantity: bundle.quantity,
    price: bundle.unitPriceCents / 100,
    status: presale.length ? ("presale" as const) : ("available" as const),
    availableDate: availableDates.length
      ? new Date(Math.max(...availableDates.map((date) => date.getTime())))
      : null,
    transactionType: "purchase" as const,
    components: bundle.components.map(
      (component) =>
        `${component.quantity} × ${component.productName}${component.variantLabel ? ` (${component.variantLabel})` : ""}`,
    ),
  };
}
