import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

import { projectRestorableOrderLines } from "@/app/lib/orders/cancellation";

const baseItem = {
  id: 1,
  orderId: 7,
  productId: 10,
  productVariantId: null,
  productVariantLabel: null,
  quantity: 3,
  priceAtPurchase: 10,
  unitCostAtPurchase: 4,
  productNameAtPurchase: "Glitter",
  transactionType: "purchase" as const,
  storeCategoryAtPurchase: "supplies" as const,
  rentalContentSectionsSnapshot: null,
  rentalStockModeSnapshot: null,
  rentalFestivalId: null,
  rentalReservationId: null,
  rentalReturnedQuantity: 0,
  updatedAt: new Date(0),
  createdAt: new Date(0),
};

const addedItem = {
  id: 100,
  adjustmentId: 50,
  baseOrderItemId: null,
  productId: 20,
  productVariantId: null,
  productNameSnapshot: "Polera",
  variantLabelSnapshot: null,
  transactionType: "purchase" as const,
  storeCategorySnapshot: "merch" as const,
  quantityDelta: 2,
  unitPriceSnapshot: 25,
  unitCostSnapshot: 10,
  createdAt: new Date(0),
};

describe("cancellation stock projection", () => {
  it("restores effective quantities regardless of line category", () => {
    const lines = projectRestorableOrderLines(
      [7],
      [baseItem],
      [
        {
          orderId: 7,
          item: { ...addedItem, baseOrderItemId: 1, id: 99, quantityDelta: -1 },
        },
        { orderId: 7, item: addedItem },
      ],
    );

    expect(lines).toMatchObject([
      { productId: 10, quantity: 2 },
      { productId: 20, quantity: 2 },
    ]);
  });

  it("keeps added lines of different categories as separate restorations", () => {
    const lines = projectRestorableOrderLines(
      [7],
      [],
      [
        { orderId: 7, item: addedItem },
        {
          orderId: 7,
          item: {
            ...addedItem,
            id: 101,
            quantityDelta: 4,
            storeCategorySnapshot: "supplies" as const,
          },
        },
      ],
    );

    expect(lines).toMatchObject([
      { productId: 20, quantity: 2 },
      { productId: 20, quantity: 4 },
    ]);
  });
});
