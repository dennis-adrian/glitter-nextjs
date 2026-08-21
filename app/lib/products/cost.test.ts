import { describe, expect, it } from "vitest";

import { resolveUnitCost } from "@/app/lib/products/cost";

describe("resolveUnitCost", () => {
  it("uses a variant override", () => {
    expect(resolveUnitCost(10, 12)).toBe(12);
  });

  it("falls back to the product cost", () => {
    expect(resolveUnitCost(10, null)).toBe(10);
  });

  it("preserves zero and unknown costs", () => {
    expect(resolveUnitCost(10, 0)).toBe(0);
    expect(resolveUnitCost(null, null)).toBeNull();
  });
});
