import { describe, expect, it } from "vitest";

import type { ProductVariantWithSelections } from "@/app/lib/products/definitions";
import {
  getProductEffectiveStock,
  getProductVariantStock,
  getVariantLabel,
} from "@/app/lib/products/variants";

const baseTimestamp = new Date("2024-01-01T00:00:00.000Z");

const baseVariantFields = {
  productId: 1,
  price: null,
  rentalStock: null,
  imageUrl: null,
  sortOrder: 0,
  updatedAt: baseTimestamp,
  createdAt: baseTimestamp,
  selections: [],
} satisfies Omit<ProductVariantWithSelections, "id" | "stock" | "isVisible">;

type EffectiveStockInput = Parameters<typeof getProductEffectiveStock>[0];
type VariantLabelInput = NonNullable<Parameters<typeof getVariantLabel>[0]>;

describe("product variant helpers", () => {
  it("uses variant stock when a variant is selected", () => {
    expect(getProductVariantStock({ stock: 20 }, { stock: 3 })).toBe(3);
  });

  it("uses base stock when no variant is selected", () => {
    expect(getProductVariantStock({ stock: 20 }, null)).toBe(20);
  });

  it("sums only visible variant stock for variant products", () => {
    const product: EffectiveStockInput = {
      stock: 20,
      variants: [
        { ...baseVariantFields, id: 1, stock: 3, isVisible: true },
        { ...baseVariantFields, id: 2, stock: 5, isVisible: false },
        { ...baseVariantFields, id: 3, stock: 7, isVisible: true },
      ],
    };

    expect(getProductEffectiveStock(product)).toBe(10);
  });

  it("treats undefined variant stock as 0 when summing effective stock", () => {
    const product: EffectiveStockInput = {
      stock: 20,
      variants: [
        { ...baseVariantFields, id: 1, stock: 3, isVisible: true },
        {
          ...baseVariantFields,
          id: 2,
          isVisible: true,
          stock: undefined,
        } as ProductVariantWithSelections,
        { ...baseVariantFields, id: 3, stock: 7, isVisible: true },
      ],
    };

    expect(getProductEffectiveStock(product)).toBe(10);
  });

  it("orders labels by option and option value sort order", () => {
    const variant: VariantLabelInput = {
      selections: [
        {
          id: 1,
          productId: 1,
          variantId: 1,
          optionId: 2,
          optionValueId: 1,
          updatedAt: baseTimestamp,
          createdAt: baseTimestamp,
          option: {
            id: 2,
            productId: 1,
            name: "Color",
            selectorDisplay: "dropdown",
            sortOrder: 2,
            updatedAt: baseTimestamp,
            createdAt: baseTimestamp,
          },
          optionValue: {
            id: 1,
            optionId: 2,
            value: "Blue",
            sortOrder: 1,
            updatedAt: baseTimestamp,
            createdAt: baseTimestamp,
          },
        },
        {
          id: 2,
          productId: 1,
          variantId: 1,
          optionId: 1,
          optionValueId: 2,
          updatedAt: baseTimestamp,
          createdAt: baseTimestamp,
          option: {
            id: 1,
            productId: 1,
            name: "Size",
            selectorDisplay: "dropdown",
            sortOrder: 1,
            updatedAt: baseTimestamp,
            createdAt: baseTimestamp,
          },
          optionValue: {
            id: 2,
            optionId: 1,
            value: "Small",
            sortOrder: 1,
            updatedAt: baseTimestamp,
            createdAt: baseTimestamp,
          },
        },
      ],
    };

    expect(getVariantLabel(variant)).toBe("Size: Small / Color: Blue");
  });
});
