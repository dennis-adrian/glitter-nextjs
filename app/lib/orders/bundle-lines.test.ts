import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/app/lib/merch/bundles", () => ({ loadBundleRecords: vi.fn() }));

import {
  bundleComponentStockErrors,
  type ResolvedOrderBundle,
} from "@/app/lib/orders/bundle-lines";
import type { products } from "@/db/schema";

type ProductRow = typeof products.$inferSelect;

describe("bundleComponentStockErrors", () => {
  // One unit of sale stock; the bundle needs two.
  const product = {
    id: 5,
    name: "Polera",
    stock: 1,
    rentalStock: 4,
    rentalStockMode: "separate",
  } as ProductRow;
  const bundle = {
    name: "Kit Festival",
    quantity: 1,
    components: [
      {
        productId: 5,
        productVariantId: null,
        variantLabel: null,
        quantity: 2,
      },
    ],
  } as unknown as ResolvedOrderBundle;
  const bundleDemand = {
    productId: 5,
    productVariantId: null,
    quantity: 2,
    transactionType: "purchase" as const,
  };

  function errorsFor(
    lines: { transactionType: "purchase" | "rental"; quantity: number }[],
    rentalStockMode: "separate" | "shared" = "separate",
  ) {
    const row = { ...product, rentalStockMode };
    return bundleComponentStockErrors(
      [bundle],
      lines.map((line) => ({
        product: row,
        productVariantId: null,
        transactionType: line.transactionType,
      })),
      [
        ...lines.map((line) => ({
          productId: 5,
          productVariantId: null,
          ...line,
        })),
        bundleDemand,
      ],
      new Map([[5, row]]),
      new Map(),
    );
  }

  it("names the component and its bundle when sale stock is short", () => {
    expect(errorsFor([])).toEqual([
      "Polera del combo Kit Festival - stock insuficiente",
    ]);
  });

  it("still checks sale stock when a separate-stock rental line shares the product", () => {
    expect(errorsFor([{ transactionType: "rental", quantity: 1 }])).toEqual([
      "Polera del combo Kit Festival - stock insuficiente",
    ]);
  });

  it("leaves the sale pool to an individual line that already checked it", () => {
    expect(errorsFor([{ transactionType: "purchase", quantity: 1 }])).toEqual(
      [],
    );
    expect(
      errorsFor([{ transactionType: "rental", quantity: 1 }], "shared"),
    ).toEqual([]);
  });
});
