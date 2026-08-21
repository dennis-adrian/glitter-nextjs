import { describe, expect, it } from "vitest";

import {
  sanitizeCsvCell,
  serializeOrderLineItemsCsv,
  serializeOrdersSummaryCsv,
  serializeCsvRows,
  serializeProfitabilityCsv,
} from "@/app/lib/orders/csv";

describe("sanitizeCsvCell", () => {
  it("prefixes formula-like values even when they have leading whitespace", () => {
    expect(sanitizeCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(sanitizeCsvCell("  =CMD")).toBe("'  =CMD");
    expect(sanitizeCsvCell("\t+1+1")).toBe("'\t+1+1");
    expect(sanitizeCsvCell(" -1+1")).toBe("' -1+1");
    expect(sanitizeCsvCell(" @import")).toBe("' @import");
  });

  it("returns plain numeric literals unchanged, including negatives", () => {
    expect(sanitizeCsvCell("-18.00")).toBe("-18.00");
    expect(sanitizeCsvCell(" -18.00")).toBe(" -18.00");
    expect(sanitizeCsvCell("+18.00")).toBe("+18.00");
    expect(sanitizeCsvCell("42")).toBe("42");
  });

  it("returns the original untrimmed string for non-formula cells", () => {
    expect(sanitizeCsvCell("  Product Blue  ")).toBe("  Product Blue  ");
    expect(sanitizeCsvCell("")).toBe("");
    expect(sanitizeCsvCell("   ")).toBe("   ");
  });
});

describe("serializeCsvRows", () => {
  it("neutralizes spreadsheet formulas and keeps CSV escaping", () => {
    expect(serializeCsvRows([["=SUM(A1:A2)", 'Product "Blue", XL']])).toBe(
      '"\'=SUM(A1:A2)","Product ""Blue"", XL"',
    );
  });
});

const sampleOrders = [
  {
    id: 172,
    createdAt: new Date("2026-08-20T12:30:00.000Z"),
    status: "paid",
    totalAmount: 40,
    customer: null,
    guestName: "=Cliente",
    guestEmail: "guest@example.com",
    guestPhone: "70000000",
    orderItems: [
      {
        productId: 9,
        productVariantId: 4,
        productVariantLabel: "Personaje: Antonieta",
        productNameAtPurchase: "Polera",
        product: { name: "Nombre actual" },
        quantity: 2,
        priceAtPurchase: 15,
        unitCostAtPurchase: 6,
        transactionType: "purchase" as const,
        storeCategoryAtPurchase: "merch" as const,
      },
      {
        productId: 12,
        productVariantId: null,
        productVariantLabel: null,
        productNameAtPurchase: "Glitter biodegradable",
        product: { name: "Glitter biodegradable" },
        quantity: 1,
        priceAtPurchase: 10,
        unitCostAtPurchase: 4,
        transactionType: "purchase" as const,
        storeCategoryAtPurchase: "supplies" as const,
      },
    ],
  },
];

describe("order export serializers", () => {
  it("keeps the order-time variant and product snapshots in summary exports", () => {
    const csv = serializeOrdersSummaryCsv(sampleOrders);

    expect(csv).toContain('"items_summary"');
    expect(csv).toContain('"2x Polera (Personaje: Antonieta)');
    expect(csv).toContain('"\'=Cliente"');
  });

  it("separates the scoped subtotal from the whole order total", () => {
    const allScope = serializeOrdersSummaryCsv(sampleOrders, "all");
    const merchScope = serializeOrdersSummaryCsv(sampleOrders, "merch");

    expect(allScope).toContain('"all","true","3"');
    // Both totals match under `all`.
    expect(allScope).toContain('"40.00","40.00"');
    expect(merchScope).toContain('"merch","true","2"');
    expect(merchScope).toContain('"2x Polera (Personaje: Antonieta)"');
    expect(merchScope).not.toContain("Glitter biodegradable");
    // Scoped subtotal narrows; the whole-order total does not.
    expect(merchScope).toContain('"30.00","40.00"');
  });

  it("emits one profitability-safe row per order line", () => {
    const csv = serializeOrderLineItemsCsv(sampleOrders);

    expect(csv).toContain('"store_category"');
    expect(csv).toContain('"variant_label"');
    expect(csv).toContain('"Personaje: Antonieta"');
    expect(csv).toContain('"30.00"');
    expect(csv).toContain('"12.00"');
    expect(csv).toContain('"18.00"');
    expect(csv).toContain('"known"');
  });

  it("emits only matching lines under a concrete category scope", () => {
    const csv = serializeOrderLineItemsCsv(sampleOrders, "supplies");

    expect(csv).toContain('"supplies"');
    expect(csv).toContain('"Glitter biodegradable"');
    expect(csv).not.toContain('"Personaje: Antonieta"');
  });

  it("does not export rental snapshots as product costs", () => {
    const csv = serializeOrderLineItemsCsv([
      {
        ...sampleOrders[0],
        orderItems: [
          {
            ...sampleOrders[0].orderItems[0],
            transactionType: "rental" as const,
            unitCostAtPurchase: 6,
            storeCategoryAtPurchase: "merch" as const,
          },
        ],
      },
    ]);

    expect(csv).toContain('"30.00","","","","","unavailable"');
  });
});

describe("profitability export serializer", () => {
  it("keeps unknown costs empty and sanitizes product labels", () => {
    const csv = serializeProfitabilityCsv([
      {
        orderId: 172,
        date: new Date("2026-08-20T12:30:00.000Z"),
        product: "=Polera",
        quantity: 2,
        revenue: 30,
        cost: null,
        profit: null,
        status: "paid",
        storeCategory: "supplies" as const,
      },
    ]);

    expect(csv).toContain('"supplies"');
    expect(csv).toContain('"\'=Polera"');
    expect(csv).toContain('"30.00","","","","missing","paid"');
  });
});
