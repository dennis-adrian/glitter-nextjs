import { describe, expect, it } from "vitest";

import {
  getEffectiveOrderLines,
  getEffectiveOrderTotal,
} from "@/app/lib/orders/projection";

describe("effective order projection", () => {
  it("applies additive deltas without changing source lines", () => {
    const baseLines = [
      {
        id: 1,
        productId: 1,
        productVariantId: null,
        productVariantLabel: null,
        productNameAtPurchase: "Polera",
        productName: "Nombre actual",
        quantity: 2,
        priceAtPurchase: 10,
        unitCostAtPurchase: 4,
        transactionType: "purchase" as const,
        storeCategoryAtPurchase: "merch" as const,
      },
    ];
    const adjustmentLines = [
      {
        id: 2,
        baseOrderItemId: 1,
        productId: 1,
        productVariantId: null,
        productNameSnapshot: "Polera",
        variantLabelSnapshot: null,
        quantityDelta: 3,
        unitPriceSnapshot: 10,
        unitCostSnapshot: 4,
        transactionType: "purchase" as const,
        storeCategorySnapshot: "merch" as const,
      },
      {
        id: 3,
        baseOrderItemId: 1,
        productId: 1,
        productVariantId: null,
        productNameSnapshot: "Polera",
        variantLabelSnapshot: null,
        quantityDelta: -1,
        unitPriceSnapshot: 10,
        unitCostSnapshot: 4,
        transactionType: "purchase" as const,
        storeCategorySnapshot: "merch" as const,
      },
    ];

    const lines = getEffectiveOrderLines(baseLines, adjustmentLines);

    expect(baseLines[0].quantity).toBe(2);
    expect(lines).toMatchObject([{ baseOrderItemId: 1, quantity: 4 }]);
    expect(getEffectiveOrderTotal(lines)).toBe(40);
  });

  it("hides zeroed lines and retains added lines independently", () => {
    const lines = getEffectiveOrderLines(
      [
        {
          id: 1,
          productId: 1,
          productVariantId: null,
          productVariantLabel: null,
          productNameAtPurchase: null,
          productName: "Polera",
          quantity: 1,
          priceAtPurchase: 10,
          unitCostAtPurchase: null,
          transactionType: "purchase",
          storeCategoryAtPurchase: "merch" as const,
        },
      ],
      [
        {
          id: 10,
          baseOrderItemId: 1,
          productId: 1,
          productVariantId: null,
          productNameSnapshot: "Polera",
          variantLabelSnapshot: null,
          quantityDelta: -1,
          unitPriceSnapshot: 10,
          unitCostSnapshot: null,
          transactionType: "purchase",
          storeCategorySnapshot: "merch" as const,
        },
        {
          id: 11,
          baseOrderItemId: null,
          productId: 2,
          productVariantId: null,
          productNameSnapshot: "Bolso",
          variantLabelSnapshot: null,
          quantityDelta: 1,
          unitPriceSnapshot: 20,
          unitCostSnapshot: 9,
          transactionType: "purchase",
          storeCategorySnapshot: "merch" as const,
        },
      ],
    );

    expect(lines).toMatchObject([
      { key: "adjustment:11", adjustmentItemId: 11, quantity: 1 },
    ]);
  });

  it("groups later deltas into the original added-line identity", () => {
    const shared = {
      baseOrderItemId: null,
      productId: 2,
      productVariantId: 4,
      productNameSnapshot: "Polera",
      variantLabelSnapshot: "Morado / M",
      unitPriceSnapshot: 25,
      unitCostSnapshot: 10,
      transactionType: "purchase" as const,
      storeCategorySnapshot: "merch" as const,
    };
    const lines = getEffectiveOrderLines(
      [],
      [
        { ...shared, id: 20, quantityDelta: 3 },
        { ...shared, id: 21, quantityDelta: -1 },
      ],
    );

    expect(lines).toMatchObject([
      { key: "adjustment:20", adjustmentItemId: 20, quantity: 2 },
    ]);
  });

  it("carries base and added categories into effective lines", () => {
    const lines = getEffectiveOrderLines(
      [
        {
          id: 1,
          productId: 1,
          productVariantId: null,
          productVariantLabel: null,
          productNameAtPurchase: "Glitter",
          productName: "Glitter",
          quantity: 2,
          priceAtPurchase: 10,
          unitCostAtPurchase: 4,
          transactionType: "purchase",
          storeCategoryAtPurchase: "supplies",
        },
      ],
      [
        {
          id: 30,
          baseOrderItemId: null,
          productId: 2,
          productVariantId: null,
          productNameSnapshot: "Polera",
          variantLabelSnapshot: null,
          quantityDelta: 1,
          unitPriceSnapshot: 20,
          unitCostSnapshot: 9,
          transactionType: "purchase",
          storeCategorySnapshot: "merch",
        },
      ],
    );

    expect(lines).toMatchObject([
      { baseOrderItemId: 1, storeCategory: "supplies" },
      { adjustmentItemId: 30, storeCategory: "merch" },
    ]);
  });

  it("keeps otherwise-identical added lines of different categories apart", () => {
    const shared = {
      baseOrderItemId: null,
      productId: 2,
      productVariantId: null,
      productNameSnapshot: "Polera",
      variantLabelSnapshot: null,
      unitPriceSnapshot: 25,
      unitCostSnapshot: 10,
      transactionType: "purchase" as const,
    };
    const lines = getEffectiveOrderLines(
      [],
      [
        {
          ...shared,
          id: 40,
          quantityDelta: 2,
          storeCategorySnapshot: "merch" as const,
        },
        {
          ...shared,
          id: 41,
          quantityDelta: 3,
          storeCategorySnapshot: "supplies" as const,
        },
      ],
    );

    expect(lines).toMatchObject([
      { adjustmentItemId: 40, quantity: 2, storeCategory: "merch" },
      { adjustmentItemId: 41, quantity: 3, storeCategory: "supplies" },
    ]);
  });
});
