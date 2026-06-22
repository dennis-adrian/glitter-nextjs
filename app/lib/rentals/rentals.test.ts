import { describe, expect, it } from "vitest";

import { resolveRentalLineContext } from "@/app/lib/rentals/rental-context";
import {
  deriveRentalStatus,
  getRentalOutstandingQuantity,
} from "@/app/lib/rentals/status";
import {
  getAvailableStockForTransaction,
  getSeparatePoolLineCap,
  getSharedPoolRemainingStock,
  getTransactionPoolRemainingStock,
  isSeparatePoolOrderQuantityValid,
} from "@/app/lib/rentals/stock";
import { validateProductRentalSettings } from "@/app/lib/rentals/validation";
import { orderMatchesRentalFilter } from "@/app/lib/rentals/order-filters";
import { getLineUnitPrice } from "@/app/lib/orders/utils";

describe("rental status", () => {
  it("derives rental lifecycle states", () => {
    expect(
      deriveRentalStatus({
        transactionType: "purchase",
        quantity: 2,
        rentalReturnedQuantity: 0,
      }),
    ).toBe("not_applicable");

    expect(
      deriveRentalStatus({
        transactionType: "rental",
        quantity: 2,
        rentalReturnedQuantity: 0,
      }),
    ).toBe("out");

    expect(
      deriveRentalStatus({
        transactionType: "rental",
        quantity: 2,
        rentalReturnedQuantity: 1,
      }),
    ).toBe("partially_returned");

    expect(
      deriveRentalStatus({
        transactionType: "rental",
        quantity: 2,
        rentalReturnedQuantity: 2,
      }),
    ).toBe("returned");
  });

  it("calculates outstanding rental quantity", () => {
    expect(
      getRentalOutstandingQuantity({
        quantity: 3,
        rentalReturnedQuantity: 1,
      }),
    ).toBe(2);
  });
});

describe("rental stock", () => {
  it("uses separate rental stock when configured", () => {
    expect(
      getAvailableStockForTransaction(
        {
          stock: 10,
          rentalStock: 4,
          rentalStockMode: "separate",
        },
        { stock: 10, rentalStock: 2 },
        "rental",
      ),
    ).toBe(2);
  });

  it("uses shared sale stock for rental when configured", () => {
    expect(
      getAvailableStockForTransaction(
        {
          stock: 10,
          rentalStock: 4,
          rentalStockMode: "shared",
        },
        { stock: 6, rentalStock: 2 },
        "rental",
      ),
    ).toBe(6);
  });

  it("subtracts shared-pool demand from sibling cart lines", () => {
    const product = {
      stock: 6,
      rentalStock: 4,
      rentalStockMode: "shared" as const,
    };

    expect(
      getSharedPoolRemainingStock(
        product,
        null,
        "rental",
        [
          {
            id: 1,
            productId: 1,
            productVariantId: null,
            transactionType: "purchase",
            quantity: 4,
          },
          {
            id: 2,
            productId: 1,
            productVariantId: null,
            transactionType: "rental",
            quantity: 2,
          },
        ],
        { id: 2, productId: 1, productVariantId: null },
      ),
    ).toBe(2);
  });

  it("blocks separate-pool rental adds when cart already holds full pool", () => {
    const product = {
      stock: 10,
      rentalStock: 5,
      rentalStockMode: "separate" as const,
    };
    const siblingLine = {
      id: 1,
      productId: 1,
      productVariantId: null,
      transactionType: "rental" as const,
      quantity: 5,
    };

    expect(
      getTransactionPoolRemainingStock(
        product,
        null,
        "rental",
        [siblingLine],
        { productId: 1, productVariantId: null },
      ),
    ).toBe(0);

    expect(
      getSeparatePoolLineCap(5, [siblingLine], "rental", {
        id: 1,
        productId: 1,
        productVariantId: null,
      }),
    ).toBe(5);
  });

  it("rejects separate-pool order quantity above rental stock", () => {
    expect(
      isSeparatePoolOrderQuantityValid(
        {
          stock: 10,
          rentalStock: 5,
          rentalStockMode: "separate",
        },
        null,
        "rental",
        10,
      ),
    ).toBe(false);

    expect(
      isSeparatePoolOrderQuantityValid(
        {
          stock: 10,
          rentalStock: 5,
          rentalStockMode: "separate",
        },
        null,
        "rental",
        3,
      ),
    ).toBe(true);
  });
});

describe("rental context resolution", () => {
  const contexts = [
    {
      festivalId: 1,
      festivalName: "Festival",
      reservationId: 10,
      standId: 100,
      standLabel: "A",
      standNumber: 1,
    },
  ];

  it("auto-selects when exactly one eligible context", () => {
    expect(resolveRentalLineContext(contexts, null, null)).toEqual({
      ok: true,
      context: { festivalId: 1, reservationId: 10 },
    });
  });

  it("requires explicit context when multiple are available", () => {
    const result = resolveRentalLineContext(
      [
        ...contexts,
        {
          festivalId: 2,
          festivalName: "Other",
          reservationId: 20,
          standId: 200,
          standLabel: "B",
          standNumber: 2,
        },
      ],
      null,
      null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.cause).toBe("rental_context_required");
    }
  });
});

describe("rental product validation", () => {
  it("requires at least one transaction mode", () => {
    expect(
      validateProductRentalSettings({
        isPurchasable: false,
        isRentable: false,
        hasVariants: false,
      }),
    ).not.toBeNull();
  });

  it("requires rental price for rentable products", () => {
    expect(
      validateProductRentalSettings({
        isPurchasable: true,
        isRentable: true,
        rentalPrice: null,
        hasVariants: false,
      }),
    ).toMatch(/precio de alquiler/i);
  });

  it("requires variant rental stocks in separate mode", () => {
    expect(
      validateProductRentalSettings({
        isPurchasable: true,
        isRentable: true,
        rentalPrice: 10,
        rentalStockMode: "separate",
        hasVariants: true,
        variantRentalStocks: [],
      }),
    ).toMatch(/stock de alquiler/i);
  });
});

describe("rental order filters", () => {
  const sampleOrder = {
    orderItems: [
      {
        transactionType: "purchase" as const,
        quantity: 1,
        rentalReturnedQuantity: 0,
      },
      {
        transactionType: "rental" as const,
        quantity: 2,
        rentalReturnedQuantity: 0,
      },
    ],
  };

  it("matches rental filters", () => {
    expect(orderMatchesRentalFilter(sampleOrder, "has_rental")).toBe(true);
    expect(orderMatchesRentalFilter(sampleOrder, "out")).toBe(true);
    expect(orderMatchesRentalFilter(sampleOrder, "returned")).toBe(false);
  });

  it("uses order-level status for mixed rental orders", () => {
    const mixedOrder = {
      orderItems: [
        {
          transactionType: "rental" as const,
          quantity: 2,
          rentalReturnedQuantity: 0,
        },
        {
          transactionType: "rental" as const,
          quantity: 1,
          rentalReturnedQuantity: 1,
        },
      ],
    };

    expect(orderMatchesRentalFilter(mixedOrder, "out")).toBe(false);
    expect(orderMatchesRentalFilter(mixedOrder, "partially_returned")).toBe(
      true,
    );
    expect(orderMatchesRentalFilter(mixedOrder, "returned")).toBe(false);
  });
});

describe("line unit price", () => {
  it("uses rental price for rental lines", () => {
    expect(
      getLineUnitPrice(
        {
          price: 100,
          discount: 0,
          discountUnit: "percentage",
          rentalPrice: 25,
        } as Parameters<typeof getLineUnitPrice>[0],
        null,
        "rental",
      ),
    ).toBe(25);
  });
});
