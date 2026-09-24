import { describe, expect, it } from "vitest";
import type {
  BaseProductWithImages,
  ProductVariantWithSelections,
} from "@/app/lib/products/definitions";
import type { BundleRecord } from "./bundle-definitions";
import {
  aggregateStockDemand,
  allocateBundlePrice,
  buildBundleSelectionKey,
  bundleHasStock,
  bundleSaveEvaluationOptions,
  evaluateBundle,
  maxBundleQuantity,
  resolveBundleSelection,
  toCents,
} from "./bundle-pricing";

const product = (
  id: number,
  extra: Partial<BaseProductWithImages> = {},
): BaseProductWithImages => ({
  id,
  name: `Producto ${id}`,
  slug: `producto-${id}`,
  description: null,
  price: 100,
  stock: 5,
  unitCost: null,
  lowStockThreshold: 5,
  imageUrl: null,
  isNew: true,
  isFeatured: false,
  isVisible: true,
  storeCategory: "merch",
  availableDate: null,
  discount: 0,
  discountUnit: "percentage",
  status: "available",
  isPurchasable: true,
  isRentable: false,
  rentalPrice: null,
  rentalStockMode: "shared",
  rentalStock: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  images: [],
  variants: [],
  ...extra,
});

const variant = (
  id: number,
  productId: number,
  label: string,
  extra: Partial<ProductVariantWithSelections> = {},
): ProductVariantWithSelections => ({
  id,
  productId,
  price: null,
  unitCost: null,
  stock: 4,
  lowStockThreshold: 5,
  rentalStock: null,
  imageUrl: null,
  isVisible: true,
  sortOrder: id,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  selections: [
    {
      id,
      productId,
      variantId: id,
      optionId: 1,
      optionValueId: id,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      option: {
        id: 1,
        productId,
        name: "Talla",
        selectorDisplay: "button",
        sortOrder: 0,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      },
      optionValue: {
        id,
        optionId: 1,
        value: label,
        sortOrder: id,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      },
    },
  ],
  ...extra,
});

const shirt = product(1, {
  name: "Polera",
  price: 100,
  variants: [
    variant(11, 1, "S"),
    variant(12, 1, "M", { stock: 1 }),
    variant(13, 1, "L", { stock: 0 }),
  ],
});
const tote = product(2, { name: "Tote", price: 60, stock: 3 });
const stickers = product(3, { name: "Stickers", price: 10, stock: 10 });
const catalog = new Map([shirt, tote, stickers].map((p) => [p.id, p]));

const bundle = (
  extra: Partial<Pick<BundleRecord, "price" | "components">> = {},
): Pick<BundleRecord, "price" | "components"> => ({
  price: 150,
  components: [
    { id: 101, productId: 1, quantity: 1, sortOrder: 0, variantIds: [11, 12] },
    { id: 102, productId: 2, quantity: 1, sortOrder: 1, variantIds: [] },
    { id: 103, productId: 3, quantity: 2, sortOrder: 2, variantIds: [] },
  ],
  ...extra,
});

describe("allocateBundlePrice", () => {
  it("allocates the PRD example exactly with deterministic remainders", () => {
    const tiers = allocateBundlePrice(15000, [
      { key: "shirt", unitListCents: 10000, units: 1 },
      { key: "tote", unitListCents: 6000, units: 1 },
      { key: "stickers", unitListCents: 2000, units: 1 },
    ]);
    expect(tiers).toEqual([
      { key: "shirt", unitListCents: 10000, paidUnitCents: 8333, units: 1 },
      { key: "tote", unitListCents: 6000, paidUnitCents: 5000, units: 1 },
      { key: "stickers", unitListCents: 2000, paidUnitCents: 1667, units: 1 },
    ]);
  });

  it("splits a multi-unit component into two tiers when cents do not divide evenly", () => {
    // 3 × Bs30 + Bs20 = Bs110 sold for Bs100: 2727.27 and 1818.18 cents.
    const tiers = allocateBundlePrice(10000, [
      { key: "a", unitListCents: 3000, units: 3 },
      { key: "b", unitListCents: 2000, units: 1 },
    ]);
    const paid = tiers.reduce(
      (sum, tier) => sum + tier.paidUnitCents * tier.units,
      0,
    );
    expect(paid).toBe(10000);
    expect(tiers).toEqual([
      { key: "a", unitListCents: 3000, paidUnitCents: 2728, units: 1 },
      { key: "a", unitListCents: 3000, paidUnitCents: 2727, units: 2 },
      { key: "b", unitListCents: 2000, paidUnitCents: 1818, units: 1 },
    ]);
  });

  it("always sums to the price and never exceeds list prices", () => {
    let seed = 7;
    const random = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return (seed % max) + 1;
    };
    for (let run = 0; run < 500; run += 1) {
      const components = Array.from({ length: random(5) + 1 }, (_, i) => ({
        key: String(i),
        unitListCents: random(20000),
        units: random(4),
      }));
      const separate = components.reduce(
        (sum, c) => sum + c.unitListCents * c.units,
        0,
      );
      const price = random(separate - 1);
      const tiers = allocateBundlePrice(price, components);
      expect(
        tiers.reduce((sum, tier) => sum + tier.paidUnitCents * tier.units, 0),
      ).toBe(price);
      for (const tier of tiers) {
        expect(tier.paidUnitCents).toBeGreaterThanOrEqual(0);
        expect(tier.paidUnitCents).toBeLessThanOrEqual(tier.unitListCents);
      }
      for (const component of components) {
        expect(
          tiers
            .filter((tier) => tier.key === component.key)
            .reduce((sum, tier) => sum + tier.units, 0),
        ).toBe(component.units);
      }
    }
  });

  it("rejects prices that are not discounted", () => {
    expect(() =>
      allocateBundlePrice(2000, [{ key: "a", unitListCents: 1000, units: 2 }]),
    ).toThrow(/below/);
    expect(() =>
      allocateBundlePrice(0, [{ key: "a", unitListCents: 1000, units: 2 }]),
    ).toThrow(/positive/);
  });
});

describe("evaluateBundle", () => {
  it("computes the separate total from current selling prices", () => {
    const discountedTote = product(2, {
      name: "Tote",
      price: 80,
      discount: 25,
      discountUnit: "percentage",
    });
    const evaluation = evaluateBundle(
      bundle(),
      new Map([...catalog, [2, discountedTote]]),
      { mode: "publish" },
    );
    expect(evaluation.issues).toEqual([]);
    expect(evaluation.priceCents).toBe(15000);
    expect(evaluation.separateMinCents).toBe(10000 + 6000 + 2 * 1000);
    expect(evaluation.components.map((c) => c.choice)).toEqual([
      "choice",
      "none",
      "none",
    ]);
  });

  it("requires a real discount and two distinct products", () => {
    expect(
      evaluateBundle(bundle({ price: 180 }), catalog, {
        mode: "sale",
      }).issues.map((issue) => issue.code),
    ).toEqual(["not_discounted"]);
    expect(
      evaluateBundle(
        bundle({
          price: 150,
          components: [
            { id: 1, productId: 2, quantity: 2, sortOrder: 0, variantIds: [] },
            { id: 2, productId: 2, quantity: 1, sortOrder: 1, variantIds: [] },
          ],
        }),
        catalog,
        { mode: "sale" },
      ).issues.map((issue) => issue.code),
    ).toEqual(["too_few_products"]);
  });

  it("rejects hidden, supplies, unpurchasable and missing products", () => {
    const codes = evaluateBundle(
      bundle(),
      new Map<number, BaseProductWithImages>([
        [1, { ...shirt, isVisible: false }],
        [2, { ...tote, storeCategory: "supplies", isPurchasable: false }],
      ]),
      { mode: "sale" },
    ).issues.map((issue) => issue.code);
    expect(codes).toEqual([
      "product_hidden",
      "product_not_merch",
      "product_not_purchasable",
      "product_missing",
    ]);
  });

  it("requires same-price selectable variants only when publishing", () => {
    const pricedShirt = {
      ...shirt,
      variants: [
        variant(11, 1, "S"),
        variant(12, 1, "M", { price: 120, stock: 1 }),
      ],
    };
    const products = new Map([...catalog, [1, pricedShirt]]);
    expect(
      evaluateBundle(bundle(), products, { mode: "publish" }).issues.map(
        (issue) => issue.code,
      ),
    ).toEqual(["variant_price_mismatch"]);
    const sale = evaluateBundle(bundle(), products, { mode: "sale" });
    expect(sale.issues).toEqual([]);
    expect(sale.separateMinCents).toBe(18000);
    expect(sale.separateMaxCents).toBe(20000);
  });

  it("holds only added or changed components of a published bundle to the same-price rule", () => {
    // M went up after publishing: the bundle keeps selling (sale rules).
    const diverged = new Map([
      ...catalog,
      [
        1,
        {
          ...shirt,
          variants: [
            variant(11, 1, "S"),
            variant(12, 1, "M", { price: 120, stock: 1 }),
          ],
        },
      ],
    ]);
    const stored = { isVisible: true, components: bundle().components };
    const codes = (
      next: ReturnType<typeof bundle>,
      options: ReturnType<typeof bundleSaveEvaluationOptions>,
    ) => evaluateBundle(next, diverged, options).issues.map((i) => i.code);
    const staysPublished = bundleSaveEvaluationOptions(stored, true);

    // Price, name or order edits (eligible variants in any order) still save.
    expect(codes(bundle({ price: 140 }), staysPublished)).toEqual([]);
    expect(
      codes(
        bundle({
          components: bundle().components.map((c) =>
            c.id === 101 ? { ...c, sortOrder: 5, variantIds: [12, 11] } : c,
          ),
        }),
        staysPublished,
      ),
    ).toEqual([]);
    // Changing the shirt's quantity or sizes, or adding it anew, does not.
    for (const change of [
      { quantity: 2 },
      { variantIds: [11, 12, 13] },
      { id: -1 },
    ]) {
      expect(
        codes(
          bundle({
            components: bundle().components.map((c) =>
              c.id === 101 ? { ...c, ...change } : c,
            ),
          }),
          staysPublished,
        ),
      ).toEqual(["variant_price_mismatch"]);
    }
    // Publishing a draft, or saving one, applies it to every component.
    for (const options of [
      bundleSaveEvaluationOptions({ ...stored, isVisible: false }, true),
      bundleSaveEvaluationOptions(null, true),
      bundleSaveEvaluationOptions(stored, false),
    ]) {
      expect(codes(bundle(), options)).toEqual(["variant_price_mismatch"]);
    }
  });

  it("drops hidden variants and flags components left without options", () => {
    const hidden = {
      ...shirt,
      variants: [
        variant(11, 1, "S", { isVisible: false }),
        variant(12, 1, "M", { isVisible: false }),
      ],
    };
    expect(
      evaluateBundle(bundle(), new Map([...catalog, [1, hidden]]), {
        mode: "sale",
      }).issues.map((issue) => issue.code),
    ).toEqual(["variant_unavailable"]);
    expect(
      evaluateBundle(
        bundle({
          components: [
            {
              id: 101,
              productId: 1,
              quantity: 1,
              sortOrder: 0,
              variantIds: [],
            },
            {
              id: 102,
              productId: 2,
              quantity: 1,
              sortOrder: 1,
              variantIds: [],
            },
          ],
        }),
        catalog,
        { mode: "sale" },
      ).issues.map((issue) => issue.code),
    ).toEqual(["variant_required"]);
  });
});

describe("resolveBundleSelection", () => {
  const evaluation = evaluateBundle(bundle(), catalog, { mode: "sale" });

  it("resolves chosen variants and variant-less components", () => {
    const result = resolveBundleSelection(evaluation, [
      { componentId: 101, productVariantId: 12 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.components.map((c) => [
        c.productId,
        c.productVariantId,
        c.quantity,
      ]),
    ).toEqual([
      [1, 12, 1],
      [2, null, 1],
      [3, null, 2],
    ]);
    expect(result.separateCents).toBe(18000);
  });

  it("rejects missing, ineligible, duplicated and unknown choices", () => {
    expect(resolveBundleSelection(evaluation, []).ok).toBe(false);
    expect(
      resolveBundleSelection(evaluation, [
        { componentId: 101, productVariantId: 13 },
      ]).ok,
    ).toBe(false);
    expect(
      resolveBundleSelection(evaluation, [
        { componentId: 101, productVariantId: 11 },
        { componentId: 101, productVariantId: 12 },
      ]).ok,
    ).toBe(false);
    expect(
      resolveBundleSelection(evaluation, [
        { componentId: 101, productVariantId: 11 },
        { componentId: 999, productVariantId: 11 },
      ]).ok,
    ).toBe(false);
    expect(
      resolveBundleSelection(evaluation, [
        { componentId: 101, productVariantId: 11 },
        { componentId: 102, productVariantId: 11 },
      ]).ok,
    ).toBe(false);
  });
});

describe("bundle stock", () => {
  it("is limited by the scarcest component after other cart demand", () => {
    const evaluation = evaluateBundle(bundle(), catalog, { mode: "sale" });
    const result = resolveBundleSelection(evaluation, [
      { componentId: 101, productVariantId: 11 },
    ]);
    if (!result.ok) throw new Error("expected selection");
    // Shirt S 4, tote 3, stickers 10 / 2 → 3 bundles.
    expect(maxBundleQuantity(result.components)).toBe(3);
    // Two totes already in the cart as individual lines leave one bundle.
    expect(
      maxBundleQuantity(
        result.components,
        aggregateStockDemand([
          { productId: 2, productVariantId: null, quantity: 2 },
        ]),
      ),
    ).toBe(1);
  });

  it("aggregates components that share a stock pool", () => {
    expect(
      maxBundleQuantity([
        { productId: 2, productVariantId: null, quantity: 1, stock: 3 },
        { productId: 2, productVariantId: null, quantity: 1, stock: 3 },
        { productId: 3, productVariantId: null, quantity: 1, stock: 9 },
      ]),
    ).toBe(1);
  });

  it("reports whether any combination is in stock", () => {
    const evaluation = evaluateBundle(bundle(), catalog, { mode: "sale" });
    expect(bundleHasStock(evaluation.components)).toBe(true);
    const soldOut = evaluateBundle(
      bundle(),
      new Map([...catalog, [2, { ...tote, stock: 0 }]]),
      { mode: "sale" },
    );
    expect(bundleHasStock(soldOut.components)).toBe(false);
  });
});

describe("helpers", () => {
  it("builds canonical selection keys", () => {
    expect(buildBundleSelectionKey([])).toBe("-");
    expect(
      buildBundleSelectionKey([
        { componentId: 9, productVariantId: 2 },
        { componentId: 3, productVariantId: 7 },
      ]),
    ).toBe("3:7|9:2");
  });

  it("rounds prices to cents", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(100 * (1 - 0.15))).toBe(8500);
    expect(toCents(33.3333)).toBe(3333);
  });
});
