import { describe, expect, it } from "vitest";

import {
  getStoreCategoryFilenameSuffix,
  normalizeStoreCategoryScope,
  storeCategoryScopeHref,
  toConcreteStoreCategory,
  withStoreCategoryScope,
} from "@/app/lib/store/category";

describe("store category scope", () => {
  it("defaults missing, empty, and unknown values to all", () => {
    expect(normalizeStoreCategoryScope(undefined)).toBe("all");
    expect(normalizeStoreCategoryScope(null)).toBe("all");
    expect(normalizeStoreCategoryScope("")).toBe("all");
    expect(normalizeStoreCategoryScope("bogus")).toBe("all");
    expect(normalizeStoreCategoryScope(["bogus", "merch"])).toBe("all");
  });

  it("keeps valid scopes, including the first of a repeated parameter", () => {
    expect(normalizeStoreCategoryScope("merch")).toBe("merch");
    expect(normalizeStoreCategoryScope("supplies")).toBe("supplies");
    expect(normalizeStoreCategoryScope(["supplies", "merch"])).toBe("supplies");
  });

  it("narrows a scope to a concrete category", () => {
    expect(toConcreteStoreCategory("all")).toBeNull();
    expect(toConcreteStoreCategory("merch")).toBe("merch");
    expect(toConcreteStoreCategory("supplies")).toBe("supplies");
  });

  it("replaces only category and preserves every other parameter", () => {
    const params =
      "statuses=paid,pending&rental=has_rental&period=custom&from=2026-08-01&to=2026-08-15&q=Rosa&view=comfortable&category=merch";

    const next = withStoreCategoryScope(params, "supplies");

    expect(next.get("category")).toBe("supplies");
    expect(next.get("statuses")).toBe("paid,pending");
    expect(next.get("rental")).toBe("has_rental");
    expect(next.get("period")).toBe("custom");
    expect(next.get("from")).toBe("2026-08-01");
    expect(next.get("to")).toBe("2026-08-15");
    expect(next.get("q")).toBe("Rosa");
    expect(next.get("view")).toBe("comfortable");
  });

  it("drops the parameter entirely for the default scope", () => {
    const next = withStoreCategoryScope("category=supplies&period=week", "all");

    expect(next.has("category")).toBe(false);
    expect(next.get("period")).toBe("week");
  });

  it("builds clean section hrefs", () => {
    expect(storeCategoryScopeHref("/dashboard/store/orders", "all")).toBe(
      "/dashboard/store/orders",
    );
    expect(storeCategoryScopeHref("/dashboard/store/orders", "supplies")).toBe(
      "/dashboard/store/orders?category=supplies",
    );
  });

  it("uses distinct export filename suffixes", () => {
    expect(getStoreCategoryFilenameSuffix("all")).toBe("todos");
    expect(getStoreCategoryFilenameSuffix("merch")).toBe("tiendita");
    expect(getStoreCategoryFilenameSuffix("supplies")).toBe("insumos");
  });
});
