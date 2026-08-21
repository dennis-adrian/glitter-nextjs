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
        },
      ],
    );

    expect(lines).toMatchObject([{ key: "adjustment:11", quantity: 1 }]);
  });
});
