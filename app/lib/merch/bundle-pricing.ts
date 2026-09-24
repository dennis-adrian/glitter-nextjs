import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import {
  getProductVariantImageUrl,
  getVariantLabel,
} from "@/app/lib/products/variants";
import type {
  BundleCatalogProduct,
  BundleComponentOption,
  BundleComponentRecord,
  BundleEvaluation,
  BundleIssue,
  BundleRecord,
  BundleSelectionInput,
  EvaluatedBundleComponent,
  ResolvedBundleComponent,
} from "./bundle-definitions";

/** Bs → integer cents. Prices with fractional cents round half away from zero. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function formatBundleMoney(cents: number): string {
  return `Bs ${fromCents(cents).toFixed(2)}`;
}

/** Storefront card style: "Bs150" or "Bs149.50". */
export function formatBundleMoneyShort(cents: number): string {
  return cents % 100 === 0
    ? `Bs${cents / 100}`
    : `Bs${fromCents(cents).toFixed(2)}`;
}

/** Stable identity of a stock pool: one product, or one of its variants. */
export function stockResourceKey(
  productId: number,
  productVariantId: number | null | undefined,
): string {
  return `${productId}:${productVariantId ?? "base"}`;
}

/** Canonical component→variant choice, so equal configurations merge. */
export function buildBundleSelectionKey(
  selections: readonly BundleSelectionInput[],
): string {
  if (selections.length === 0) return "-";
  return [...selections]
    .sort((a, b) => a.componentId - b.componentId)
    .map((entry) => `${entry.componentId}:${entry.productVariantId}`)
    .join("|");
}

type EvaluateOptions = {
  /**
   * Publishing additionally requires selectable variants of a component to
   * share one price, so the advertised saving never depends on a choice.
   */
  mode: "publish" | "sale";
  /**
   * Publish mode, for a bundle that is already published: its stored
   * components. Only components added or changed (product, quantity or
   * eligible variants) must then have same-price variants; the others only
   * need the sale rules, so prices that diverged after publishing never block
   * an unrelated edit. See `bundleSaveEvaluationOptions`.
   */
  publishedComponents?: readonly BundleComponentRecord[];
};

function componentOptions(
  product: BundleCatalogProduct,
  variantIds: readonly number[],
): BundleComponentOption[] {
  const variants = product.variants ?? [];
  if (variants.length === 0) {
    return [
      {
        variantId: null,
        label: null,
        unitPriceCents: toCents(getProductPriceAtPurchase(product)),
        stock: product.stock ?? 0,
        imageUrl: getProductVariantImageUrl(product, null),
      },
    ];
  }
  const eligible = new Set(variantIds);
  return variants
    .filter((variant) => eligible.has(variant.id) && variant.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((variant) => ({
      variantId: variant.id,
      label: getVariantLabel(variant),
      unitPriceCents: toCents(getProductPriceAtPurchase(product, variant)),
      stock: variant.stock ?? 0,
      imageUrl: getProductVariantImageUrl(product, variant),
    }));
}

/**
 * How a save of `stored` is evaluated. Publishing a draft (or a new bundle)
 * applies every publish rule; a bundle that stays published holds only the
 * components this save adds or changes to the same-price rule. The editor
 * preview and the server both use it, so they always agree.
 */
export function bundleSaveEvaluationOptions(
  stored: Pick<BundleRecord, "isVisible" | "components"> | null | undefined,
  publish: boolean,
): EvaluateOptions {
  return {
    mode: "publish",
    publishedComponents:
      stored?.isVisible && publish ? stored.components : undefined,
  };
}

function sameVariantSet(a: readonly number[], b: readonly number[]) {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

/** Ids of components a save leaves exactly as they were published. */
function unchangedComponentIds(
  published: readonly BundleComponentRecord[],
  next: readonly BundleComponentRecord[],
): Set<number> {
  const byId = new Map(published.map((component) => [component.id, component]));
  return new Set(
    next
      .filter((component) => {
        const before = byId.get(component.id);
        return (
          before != null &&
          before.productId === component.productId &&
          before.quantity === component.quantity &&
          sameVariantSet(before.variantIds, component.variantIds)
        );
      })
      .map((component) => component.id),
  );
}

/**
 * Evaluates a bundle definition against the current catalog. Every issue is
 * blocking: a bundle with issues can be neither published nor sold.
 */
export function evaluateBundle(
  bundle: Pick<BundleRecord, "price" | "components">,
  productsById: ReadonlyMap<number, BundleCatalogProduct>,
  { mode, publishedComponents }: EvaluateOptions,
): BundleEvaluation {
  const issues: BundleIssue[] = [];
  const priceCents = toCents(bundle.price);
  const components: EvaluatedBundleComponent[] = [];
  const sortedComponents = [...bundle.components].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
  );
  const priceRuleExempt = publishedComponents
    ? unchangedComponentIds(publishedComponents, bundle.components)
    : new Set<number>();

  for (const component of sortedComponents) {
    const product = productsById.get(component.productId);
    if (!product) {
      issues.push({
        code: "product_missing",
        message: "Uno de los productos ya no existe.",
        componentId: component.id,
      });
      continue;
    }
    if (product.storeCategory !== "merch") {
      issues.push({
        code: "product_not_merch",
        message: `${product.name} ya no es un producto de merch.`,
        componentId: component.id,
      });
    }
    if (!product.isPurchasable) {
      issues.push({
        code: "product_not_purchasable",
        message: `${product.name} no está disponible para compra.`,
        componentId: component.id,
      });
    }
    if (!product.isVisible) {
      issues.push({
        code: "product_hidden",
        message: `${product.name} está oculto en la tienda.`,
        componentId: component.id,
      });
    }
    const hasVariants = (product.variants?.length ?? 0) > 0;
    if (hasVariants && component.variantIds.length === 0) {
      issues.push({
        code: "variant_required",
        message: `Elegí al menos una variante de ${product.name}.`,
        componentId: component.id,
      });
    }
    const options = componentOptions(product, component.variantIds);
    if (hasVariants && component.variantIds.length > 0 && !options.length) {
      issues.push({
        code: "variant_unavailable",
        message: `Las variantes elegidas de ${product.name} ya no están disponibles.`,
        componentId: component.id,
      });
    }
    if (
      mode === "publish" &&
      !priceRuleExempt.has(component.id) &&
      new Set(options.map((option) => option.unitPriceCents)).size > 1
    ) {
      issues.push({
        code: "variant_price_mismatch",
        message: `Las variantes elegibles de ${product.name} deben tener el mismo precio.`,
        componentId: component.id,
      });
    }
    components.push({
      componentId: component.id,
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      productStatus: product.status,
      productAvailableDate: product.availableDate,
      imageUrl:
        options[0]?.imageUrl ?? getProductVariantImageUrl(product, null),
      quantity: component.quantity,
      choice: !hasVariants
        ? "none"
        : component.variantIds.length === 1
          ? "fixed"
          : "choice",
      options,
    });
  }

  if (new Set(bundle.components.map((c) => c.productId)).size < 2) {
    issues.push({
      code: "too_few_products",
      message: "Un combo necesita al menos dos productos distintos.",
    });
  }

  const complete =
    components.length === bundle.components.length &&
    components.every((component) => component.options.length > 0);
  const separateMinCents = complete
    ? components.reduce(
        (sum, component) =>
          sum +
          component.quantity *
            Math.min(...component.options.map((o) => o.unitPriceCents)),
        0,
      )
    : null;
  const separateMaxCents = complete
    ? components.reduce(
        (sum, component) =>
          sum +
          component.quantity *
            Math.max(...component.options.map((o) => o.unitPriceCents)),
        0,
      )
    : null;

  if (!(priceCents > 0)) {
    issues.push({
      code: "price_invalid",
      message: "El precio del combo debe ser mayor a cero.",
    });
  } else if (separateMinCents != null && priceCents >= separateMinCents) {
    issues.push({
      code: "not_discounted",
      message:
        "El precio del combo debe ser menor que comprar los productos por separado.",
    });
  }

  return {
    priceCents,
    separateMinCents,
    separateMaxCents,
    components,
    issues,
  };
}

export type BundleSelectionResult =
  | { ok: true; components: ResolvedBundleComponent[]; separateCents: number }
  | { ok: false; message: string };

/**
 * Turns the customer's choices into concrete component lines. Fixed and
 * variant-less components ignore missing choices; any unknown, duplicated or
 * ineligible choice rejects the whole bundle.
 */
export function resolveBundleSelection(
  evaluation: Pick<BundleEvaluation, "components">,
  selections: readonly BundleSelectionInput[],
): BundleSelectionResult {
  const byComponent = new Map<number, number>();
  for (const selection of selections) {
    if (byComponent.has(selection.componentId)) {
      return { ok: false, message: "La selección del combo es inválida." };
    }
    byComponent.set(selection.componentId, selection.productVariantId);
  }
  const known = new Set(evaluation.components.map((c) => c.componentId));
  if ([...byComponent.keys()].some((id) => !known.has(id))) {
    return {
      ok: false,
      message: "El combo cambió. Volvé a elegir sus opciones.",
    };
  }

  const components: ResolvedBundleComponent[] = [];
  for (const component of evaluation.components) {
    const chosen = byComponent.get(component.componentId);
    let option: BundleComponentOption | undefined;
    if (component.choice === "none") {
      if (chosen != null) {
        return { ok: false, message: "La selección del combo es inválida." };
      }
      option = component.options[0];
    } else if (component.choice === "fixed") {
      option = component.options[0];
      if (chosen != null && chosen !== option?.variantId) {
        return {
          ok: false,
          message: "El combo cambió. Volvé a elegir sus opciones.",
        };
      }
    } else {
      if (chosen == null) {
        return {
          ok: false,
          message: `Elegí una opción de ${component.productName}.`,
        };
      }
      option = component.options.find((entry) => entry.variantId === chosen);
    }
    if (!option) {
      return {
        ok: false,
        message: `La opción elegida de ${component.productName} ya no está disponible.`,
      };
    }
    components.push({
      componentId: component.componentId,
      productId: component.productId,
      productName: component.productName,
      productVariantId: option.variantId,
      variantLabel: option.label,
      quantity: component.quantity,
      unitPriceCents: option.unitPriceCents,
      stock: option.stock,
      imageUrl: option.imageUrl,
      productStatus: component.productStatus,
      productAvailableDate: component.productAvailableDate,
    });
  }

  return {
    ok: true,
    components,
    separateCents: components.reduce(
      (sum, component) => sum + component.quantity * component.unitPriceCents,
      0,
    ),
  };
}

/** Units of each stock pool consumed by one bundle. */
export function bundleUnitDemand(
  components: readonly Pick<
    ResolvedBundleComponent,
    "productId" | "productVariantId" | "quantity"
  >[],
): Map<string, number> {
  const demand = new Map<string, number>();
  for (const component of components) {
    const key = stockResourceKey(
      component.productId,
      component.productVariantId,
    );
    demand.set(key, (demand.get(key) ?? 0) + component.quantity);
  }
  return demand;
}

export type StockDemandLine = {
  productId: number;
  productVariantId: number | null;
  quantity: number;
};

export function aggregateStockDemand(
  lines: readonly StockDemandLine[],
): Map<string, number> {
  const demand = new Map<string, number>();
  for (const line of lines) {
    const key = stockResourceKey(line.productId, line.productVariantId);
    demand.set(key, (demand.get(key) ?? 0) + line.quantity);
  }
  return demand;
}

/**
 * How many bundles the stock allows once `otherDemand` (every other cart line,
 * individual or bundled) is served: the scarcest component decides.
 */
export function maxBundleQuantity(
  components: readonly Pick<
    ResolvedBundleComponent,
    "productId" | "productVariantId" | "quantity" | "stock"
  >[],
  otherDemand: ReadonlyMap<string, number> = new Map(),
): number {
  const unitDemand = bundleUnitDemand(components);
  const stockByKey = new Map(
    components.map((component) => [
      stockResourceKey(component.productId, component.productVariantId),
      component.stock,
    ]),
  );
  let max = Number.POSITIVE_INFINITY;
  for (const [key, perBundle] of unitDemand) {
    const free = (stockByKey.get(key) ?? 0) - (otherDemand.get(key) ?? 0);
    max = Math.min(max, Math.floor(Math.max(0, free) / perBundle));
  }
  return Number.isFinite(max) ? max : 0;
}

/** Whether at least one bundle can be bought with some allowed combination. */
export function bundleHasStock(
  components: readonly EvaluatedBundleComponent[],
) {
  if (components.length === 0) return false;
  // Components sharing a product compete for the same pools; check every
  // pool against the combined demand of the options that could draw from it.
  const fixedDemand = new Map<string, { stock: number; demand: number }>();
  for (const component of components) {
    const sellable = component.options.filter(
      (option) => option.stock >= component.quantity,
    );
    if (sellable.length === 0) return false;
    if (component.options.length === 1) {
      const [option] = component.options;
      const key = stockResourceKey(component.productId, option.variantId);
      const current = fixedDemand.get(key) ?? {
        stock: option.stock,
        demand: 0,
      };
      current.demand += component.quantity;
      fixedDemand.set(key, current);
    }
  }
  return [...fixedDemand.values()].every(
    (entry) => entry.stock >= entry.demand,
  );
}

export type AllocationInput = {
  key: string;
  unitListCents: number;
  units: number;
};

export type AllocationTier = {
  key: string;
  unitListCents: number;
  paidUnitCents: number;
  units: number;
};

const ZERO = BigInt(0);

/**
 * Splits a bundle price across its units proportionally to their individual
 * prices, in integer cents. Largest-remainder rounding hands the leftover
 * cents one per unit (ties go to the earlier component), so the tiers always
 * add up to exactly `priceCents` and no unit is charged above its list price.
 * A component whose units receive different amounts yields two tiers.
 */
export function allocateBundlePrice(
  priceCents: number,
  components: readonly AllocationInput[],
): AllocationTier[] {
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0) {
    throw new Error("Bundle price must be a positive number of cents");
  }
  for (const component of components) {
    if (
      !Number.isSafeInteger(component.units) ||
      component.units <= 0 ||
      !Number.isSafeInteger(component.unitListCents) ||
      component.unitListCents < 0
    ) {
      throw new Error(`Invalid allocation component ${component.key}`);
    }
  }
  const separate = components.reduce(
    (sum, component) => sum + BigInt(component.units * component.unitListCents),
    ZERO,
  );
  if (BigInt(priceCents) >= separate) {
    throw new Error("Bundle price must be below the separate total");
  }

  const price = BigInt(priceCents);
  const shares = components.map((component, index) => {
    const numerator = price * BigInt(component.unitListCents);
    return {
      index,
      floor: numerator / separate,
      remainder: numerator % separate,
    };
  });
  let leftover =
    price -
    shares.reduce(
      (sum, share) => sum + share.floor * BigInt(components[share.index].units),
      ZERO,
    );
  const extraUnits = new Map<number, number>();
  const byRemainder = [...shares].sort((a, b) =>
    a.remainder === b.remainder
      ? a.index - b.index
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (const share of byRemainder) {
    if (leftover === ZERO) break;
    if (share.remainder === ZERO) break;
    const units = BigInt(components[share.index].units);
    const given = leftover < units ? leftover : units;
    extraUnits.set(share.index, Number(given));
    leftover -= given;
  }
  if (leftover !== ZERO) {
    throw new Error("Bundle allocation did not converge");
  }

  return components.flatMap((component, index) => {
    const base = Number(shares[index].floor);
    const extra = extraUnits.get(index) ?? 0;
    const tiers: AllocationTier[] = [];
    if (extra > 0) {
      tiers.push({
        key: component.key,
        unitListCents: component.unitListCents,
        paidUnitCents: base + 1,
        units: extra,
      });
    }
    if (component.units - extra > 0) {
      tiers.push({
        key: component.key,
        unitListCents: component.unitListCents,
        paidUnitCents: base,
        units: component.units - extra,
      });
    }
    return tiers;
  });
}
