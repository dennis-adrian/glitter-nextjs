import { describe, expect, it } from "vitest";
import type { BaseProductWithImages } from "@/app/lib/products/definitions";
import { filterMerchCatalog } from "./catalog";

const product = (
  id: number,
  extra: Partial<BaseProductWithImages> = {},
): BaseProductWithImages => ({
  id,
  name: `Producto ${id}`,
  slug: `producto-${id}`,
  description: null,
  price: 100,
  stock: 5,
  unitCost: null,
  lowStockThreshold: 5,
  imageUrl: null,
  isNew: true,
  isFeatured: false,
  isVisible: true,
  storeCategory: "merch",
  availableDate: null,
  discount: 0,
  discountUnit: "percentage",
  status: "available",
  isPurchasable: true,
  isRentable: false,
  rentalPrice: null,
  rentalStockMode: "shared",
  rentalStock: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  images: [],
  ...extra,
});
const filters = {
  collection: "",
  query: "",
  sort: "featured",
  available: false,
};
const collections = [
  {
    id: 1,
    name: "Festival",
    slug: "festival",
    description: null,
    imageUrl: null,
    productIds: [1, 2],
  },
];
const ids = (items: BaseProductWithImages[]) => items.map((item) => item.id);

describe("merch catalog", () => {
  it("accepts a collection slug and preserves legacy numeric links", () => {
    expect(
      ids(
        filterMerchCatalog([product(1), product(3)], collections, {
          ...filters,
          collection: "festival",
        }),
      ),
    ).toEqual([1]);
    expect(
      ids(
        filterMerchCatalog([product(1), product(3)], collections, {
          ...filters,
          collection: "1",
        }),
      ),
    ).toEqual([1]);
  });
  it("combines collection, accent-insensitive search and purchasable stock", () => {
    const items = [
      product(1, { name: "Edición violeta" }),
      product(2, { name: "Edición agotada", stock: 0 }),
      product(3, { name: "Edición otra" }),
      product(4, { isVisible: false }),
      product(5, { storeCategory: "supplies" }),
    ];
    expect(
      ids(
        filterMerchCatalog(items, collections, {
          ...filters,
          collection: "1",
          query: "EDICION",
          available: true,
        }),
      ),
    ).toEqual([1]);
    expect(ids(filterMerchCatalog(items, collections, filters))).toEqual([
      3, 2, 1,
    ]);
  });
  it("does not silently show unrelated products for a removed collection", () => {
    expect(
      filterMerchCatalog([product(1)], collections, {
        ...filters,
        collection: "999",
      }),
    ).toEqual([]);
  });
  it("sorts by actual discounted and visible variant prices without mutating input", () => {
    const items = [
      product(1),
      product(2, { discount: 30 }),
      product(3, {
        variants: [
          {
            id: 31,
            productId: 3,
            price: 80,
            stock: 1,
            isVisible: true,
            selections: [],
            sortOrder: 0,
            rentalStock: null,
            imageUrl: null,
            lowStockThreshold: null,
            unitCost: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 32,
            productId: 3,
            price: 1,
            stock: 1,
            isVisible: false,
            selections: [],
            sortOrder: 1,
            rentalStock: null,
            imageUrl: null,
            lowStockThreshold: null,
            unitCost: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      }),
    ];
    expect(
      ids(filterMerchCatalog(items, [], { ...filters, sort: "price-asc" })),
    ).toEqual([2, 3, 1]);
    expect(
      ids(filterMerchCatalog(items, [], { ...filters, sort: "price-desc" })),
    ).toEqual([1, 3, 2]);
    expect(ids(items)).toEqual([1, 2, 3]);
  });
  it("respects featured priority and lets newest override it", () => {
    const items = [
      product(1, { isFeatured: true }),
      product(2, { createdAt: new Date("2026-02-01") }),
    ];
    expect(ids(filterMerchCatalog(items, [], filters))).toEqual([1, 2]);
    expect(
      ids(filterMerchCatalog(items, [], { ...filters, sort: "newest" })),
    ).toEqual([2, 1]);
  });
  it("excludes rental-only merch from the purchase availability filter", () => {
    expect(
      filterMerchCatalog(
        [product(1, { isPurchasable: false, isRentable: true })],
        [],
        { ...filters, available: true },
      ),
    ).toEqual([]);
  });
});
