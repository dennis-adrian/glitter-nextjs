import { describe, expect, it } from "vitest";

import {
  getOrderItemDisplayName,
  toAdminOrderListRow,
} from "@/app/lib/orders/utils";
import type { OrderWithRelations } from "@/app/lib/orders/definitions";

describe("getOrderItemDisplayName", () => {
  it("uses the order-time product and variant snapshots", () => {
    expect(
      getOrderItemDisplayName({
        product: { name: "Nombre actual" },
        productNameAtPurchase: "Polera Glitter",
        productVariantLabel: "Morado / M",
      }),
    ).toBe("Polera Glitter (Morado / M)");
  });

  it("falls back to the current product name for legacy lines", () => {
    expect(
      getOrderItemDisplayName({
        product: { name: "Bolso" },
        productNameAtPurchase: null,
      }),
    ).toBe("Bolso");
  });
});

function orderWithLines(
  lines: {
    quantity: number;
    priceAtPurchase: number;
    storeCategoryAtPurchase: "merch" | "supplies";
  }[],
): OrderWithRelations {
  return {
    id: 1,
    totalAmount: lines.reduce(
      (total, line) => total + line.quantity * line.priceAtPurchase,
      0,
    ),
    orderItems: lines.map((line, index) => ({
      id: index + 1,
      ...line,
    })),
  } as unknown as OrderWithRelations;
}

describe("toAdminOrderListRow", () => {
  it("reports the whole total and every category under the all scope", () => {
    const row = toAdminOrderListRow(
      orderWithLines([
        { quantity: 2, priceAtPurchase: 15, storeCategoryAtPurchase: "merch" },
        {
          quantity: 1,
          priceAtPurchase: 10,
          storeCategoryAtPurchase: "supplies",
        },
      ]),
      "all",
    );

    expect(row.storeCategories.sort()).toEqual(["merch", "supplies"]);
    expect(row.isMixedCategory).toBe(true);
    expect(row.scopedSubtotal).toBe(40);
    expect(row.totalAmount).toBe(40);
  });

  it("subtotals only matching lines under a concrete scope", () => {
    const row = toAdminOrderListRow(
      orderWithLines([
        { quantity: 2, priceAtPurchase: 15, storeCategoryAtPurchase: "merch" },
        {
          quantity: 1,
          priceAtPurchase: 10,
          storeCategoryAtPurchase: "supplies",
        },
      ]),
      "supplies",
    );

    expect(row.scopedSubtotal).toBe(10);
    expect(row.totalAmount).toBe(40);
  });

  it("ignores zero-quantity lines when detecting a mixed order", () => {
    const row = toAdminOrderListRow(
      orderWithLines([
        { quantity: 2, priceAtPurchase: 15, storeCategoryAtPurchase: "merch" },
        {
          quantity: 0,
          priceAtPurchase: 10,
          storeCategoryAtPurchase: "supplies",
        },
      ]),
      "all",
    );

    expect(row.storeCategories).toEqual(["merch"]);
    expect(row.isMixedCategory).toBe(false);
  });
});
