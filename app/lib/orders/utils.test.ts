import { describe, expect, it } from "vitest";

import {
  getOrderBundleContents,
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

describe("getOrderBundleContents", () => {
  // Two kits: polera + 2 stickers whose units were allocated 834 and 833
  // cents, so the stickers component spans two order lines.
  const allocations = [
    { orderItemId: 23, unitsPerBundle: 1, paidUnitPriceCents: 833 },
    { orderItemId: 21, unitsPerBundle: 1, paidUnitPriceCents: 8333 },
    { orderItemId: 22, unitsPerBundle: 1, paidUnitPriceCents: 834 },
  ];
  const bundle = {
    id: 9,
    nameSnapshot: "Kit Stickers",
    unitPriceCents: 10000,
    items: allocations.map((allocation, index) => ({
      id: index + 1,
      orderBundleId: 9,
      orderId: 1,
      listUnitPriceCents: 1000,
      ...allocation,
    })),
  };
  const line = (
    id: number,
    productId: number,
    name: string,
    quantity: number,
    productVariantLabel: string | null = null,
  ) => ({
    id,
    productId,
    productVariantId: productVariantLabel ? 5 : null,
    quantity,
    priceAtPurchase: 0,
    product: { name },
    productNameAtPurchase: name,
    productVariantLabel,
  });
  const group = (lines: ReturnType<typeof line>[]) =>
    splitOrderItemsByBundle({
      orderItems: lines,
      bundles: [bundle],
    } as unknown as OrderWithRelations).bundles[0];

  it("lists one bundle's units and merges split price tiers", () => {
    const contents = getOrderBundleContents(
      group([
        line(21, 1, "Polera", 2, "Talla: M"),
        line(22, 2, "Stickers", 2),
        line(23, 2, "Stickers", 2),
      ]),
    );
    expect(
      contents.map(({ label, quantity }) => `${quantity} × ${label}`),
    ).toEqual(["1 × Polera (Talla: M)", "2 × Stickers"]);
  });

  it("lists what is left of a bundle whose components were adjusted", () => {
    const contents = getOrderBundleContents(
      group([
        line(21, 1, "Polera", 1, "Talla: M"),
        line(22, 2, "Stickers", 2),
        line(23, 2, "Stickers", 1),
      ]),
    );
    expect(
      contents.map(({ label, quantity }) => `${quantity} × ${label}`),
    ).toEqual(["1 × Polera (Talla: M)", "3 × Stickers"]);
  });
});
