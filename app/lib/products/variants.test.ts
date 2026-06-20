import { describe, expect, it } from "vitest";

import {
  getProductEffectiveStock,
  getProductVariantStock,
  getVariantLabel,
} from "@/app/lib/products/variants";

describe("product variant helpers", () => {
  it("uses variant stock when a variant is selected", () => {
    expect(getProductVariantStock({ stock: 20 }, { stock: 3 })).toBe(3);
  });

  it("uses base stock when no variant is selected", () => {
    expect(getProductVariantStock({ stock: 20 }, null)).toBe(20);
  });

  it("sums only visible variant stock for variant products", () => {
    expect(
      getProductEffectiveStock({
        stock: 20,
        variants: [
          { stock: 3, isVisible: true },
          { stock: 5, isVisible: false },
          { stock: 7, isVisible: true },
        ],
      } as any),
    ).toBe(10);
  });

  it("treats undefined variant stock as 0 when summing effective stock", () => {
    expect(
      getProductEffectiveStock({
        stock: 20,
        variants: [
          { stock: 3, isVisible: true },
          { stock: undefined, isVisible: true },
          { stock: 7, isVisible: true },
        ],
      } as any),
    ).toBe(10);
  });

  it("orders labels by option and option value sort order", () => {
    expect(
      getVariantLabel({
        selections: [
          {
            option: { id: 2, name: "Color", sortOrder: 2 },
            optionValue: { value: "Blue", sortOrder: 1 },
          },
          {
            option: { id: 1, name: "Size", sortOrder: 1 },
            optionValue: { value: "Small", sortOrder: 1 },
          },
        ],
      } as any),
    ).toBe("Size: Small / Color: Blue");
  });
});
