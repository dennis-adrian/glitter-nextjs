import { describe, expect, it } from "vitest";

import {
  getOrderItemDisplayName,
  getOrderLineLabel,
  splitOrderItemsByBundle,
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

describe("bundle order lines", () => {
  const bundle = {
    id: 7,
    orderId: 1,
    bundleId: 3,
    bundleVersion: 2,
    nameSnapshot: "Kit Clásicos",
    slugSnapshot: "kit-clasicos",
    imageUrlSnapshot: null,
    quantity: 2,
    unitPriceCents: 15000,
    separateUnitPriceCents: 18000,
    totalCents: 30000,
    createdAt: new Date("2026-09-01"),
    items: [
      { orderItemId: 11, unitsPerBundle: 1 },
      { orderItemId: 12, unitsPerBundle: 1 },
      { orderItemId: 13, unitsPerBundle: 2 },
    ].map((allocation, index) => ({
      id: index + 1,
      orderBundleId: 7,
      orderId: 1,
      listUnitPriceCents: 1000,
      paidUnitPriceCents: 800,
      createdAt: new Date("2026-09-01"),
      ...allocation,
    })),
  };
  const line = (id: number, quantity: number, priceAtPurchase: number) => ({
    id,
    quantity,
    priceAtPurchase,
    product: { name: `Producto ${id}` },
    productNameAtPurchase: `Producto ${id}`,
    productVariantLabel: null,
    bundleAllocation:
      id >= 11 && id <= 13
        ? { orderBundle: { nameSnapshot: "Kit Clásicos" } }
        : null,
  });
  const order = (lines: ReturnType<typeof line>[]) =>
    ({ orderItems: lines, bundles: [bundle] }) as unknown as OrderWithRelations;

  it("groups bundle components and keeps individual lines apart", () => {
    const { bundles, items } = splitOrderItemsByBundle(
      order([
        line(10, 1, 60),
        line(11, 2, 83.34),
        line(12, 2, 50),
        line(13, 4, 8.33),
      ]),
    );
    expect(items.map((item) => item.id)).toEqual([10]);
    expect(bundles).toHaveLength(1);
    expect(bundles[0].wholeQuantity).toBe(2);
    expect(bundles[0].paidTotal).toBeCloseTo(300, 2);
  });

  it("reports adjusted bundles as no longer whole", () => {
    const [group] = splitOrderItemsByBundle(
      order([line(11, 2, 83.34), line(12, 1, 50), line(13, 4, 8.33)]),
    ).bundles;
    expect(group.wholeQuantity).toBeNull();
    expect(group.items).toHaveLength(3);
  });

  it("drops fully removed bundles and treats a partial removal as adjusted", () => {
    expect(splitOrderItemsByBundle(order([line(10, 1, 60)])).bundles).toEqual(
      [],
    );
    const [group] = splitOrderItemsByBundle(
      order([line(11, 1, 83.34), line(13, 2, 8.33)]),
    ).bundles;
    expect(group.wholeQuantity).toBeNull();
  });

  it("names the bundle in compact labels", () => {
    expect(getOrderLineLabel(line(11, 1, 83.34))).toBe(
      "Producto 11 · Combo Kit Clásicos",
    );
    expect(getOrderLineLabel(line(10, 1, 60))).toBe("Producto 10");
  });
});
