import { describe, expect, it } from "vitest";

import { getOrderItemDisplayName } from "@/app/lib/orders/utils";

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
