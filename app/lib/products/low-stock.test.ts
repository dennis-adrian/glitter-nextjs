import { describe, expect, it } from "vitest";

import {
  isLowStockFilter,
  isLowStockLevel,
  isProductLowStock,
} from "./low-stock";

describe("low-stock helpers", () => {
  it("treats stock at the configured threshold as low", () => {
    expect(isLowStockLevel({ stock: 5, lowStockThreshold: 5 })).toBe(true);
    expect(isLowStockLevel({ stock: 6, lowStockThreshold: 5 })).toBe(false);
  });

  it("disables the alert when the threshold is null", () => {
    expect(isLowStockLevel({ stock: 0, lowStockThreshold: null })).toBe(false);
  });

  it("uses visible variant thresholds for products with variants", () => {
    expect(
      isProductLowStock({
        stock: 100,
        lowStockThreshold: 5,
        variants: [
          { stock: 0, lowStockThreshold: null, isVisible: true },
          { stock: 2, lowStockThreshold: 3, isVisible: true },
        ],
      }),
    ).toBe(true);

    expect(
      isProductLowStock({
        stock: 0,
        lowStockThreshold: 5,
        variants: [
          { stock: 0, lowStockThreshold: 5, isVisible: false },
          { stock: 2, lowStockThreshold: null, isVisible: true },
        ],
      }),
    ).toBe(false);
  });

  it("recognizes only the low-stock URL filter", () => {
    expect(isLowStockFilter("low")).toBe(true);
    expect(isLowStockFilter(["low", "other"])).toBe(true);
    expect(isLowStockFilter("all")).toBe(false);
    expect(isLowStockFilter(undefined)).toBe(false);
  });
});
