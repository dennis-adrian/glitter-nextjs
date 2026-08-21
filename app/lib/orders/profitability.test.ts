import { describe, expect, it } from "vitest";

import {
  filterOrdersProfitability,
  mapOrdersProfitabilityQuery,
  ordersProfitabilityQuery,
} from "@/app/lib/orders/profitability";

describe("mapOrdersProfitabilityQuery", () => {
  it("returns empty totals when the query has no rows", () => {
    expect(mapOrdersProfitabilityQuery([])).toEqual({
      grossRevenue: 0,
      productCost: 0,
      grossProfit: 0,
      knownCostRevenue: 0,
      lineCount: 0,
      rows: [],
    });
  });

  it("keeps SQL totals when the left join has no effective lines", () => {
    expect(
      mapOrdersProfitabilityQuery([
        {
          order_id: null,
          date: null,
          product: null,
          quantity: null,
          revenue: null,
          cost: null,
          profit: null,
          status: null,
          gross_revenue: "0.00",
          product_cost: "0.00",
          known_cost_revenue: "0.00",
          line_count: 0,
        },
      ]),
    ).toEqual({
      grossRevenue: 0,
      productCost: 0,
      grossProfit: 0,
      knownCostRevenue: 0,
      lineCount: 0,
      rows: [],
    });
  });

  it("maps lean line rows and derives gross profit from known-cost revenue", () => {
    const date = new Date("2026-08-21T12:00:00.000Z");
    const result = mapOrdersProfitabilityQuery([
      {
        order_id: "12",
        date,
        product: "Polera Glitter (Morado / M)",
        quantity: "2",
        revenue: "50.00",
        cost: "20.00",
        profit: "30.00",
        status: "paid",
        gross_revenue: "80.00",
        product_cost: "20.00",
        known_cost_revenue: "50.00",
        line_count: 2,
      },
      {
        order_id: 13,
        date: "2026-08-20T15:00:00.000Z",
        product: "Bolso",
        quantity: 1,
        revenue: "30.00",
        cost: null,
        profit: null,
        status: "delivered",
        gross_revenue: "80.00",
        product_cost: "20.00",
        known_cost_revenue: "50.00",
        line_count: 2,
      },
    ]);

    expect(result).toEqual({
      grossRevenue: 80,
      productCost: 20,
      grossProfit: 30,
      knownCostRevenue: 50,
      lineCount: 2,
      rows: [
        {
          orderId: 12,
          date,
          product: "Polera Glitter (Morado / M)",
          quantity: 2,
          revenue: 50,
          cost: 20,
          profit: 30,
          status: "paid",
        },
        {
          orderId: 13,
          date: new Date("2026-08-20T15:00:00.000Z"),
          product: "Bolso",
          quantity: 1,
          revenue: 30,
          cost: null,
          profit: null,
          status: "delivered",
        },
      ],
    });
  });
});

describe("filterOrdersProfitability", () => {
  it("recalculates totals and cost coverage for the selected range", () => {
    const report = mapOrdersProfitabilityQuery([
      {
        order_id: 12,
        date: "2026-08-21T12:00:00.000Z",
        product: "Polera",
        quantity: 2,
        revenue: 50,
        cost: 20,
        profit: 30,
        status: "paid",
        gross_revenue: 80,
        product_cost: 20,
        known_cost_revenue: 50,
        line_count: 2,
      },
      {
        order_id: 13,
        date: "2026-07-01T12:00:00.000Z",
        product: "Bolso",
        quantity: 1,
        revenue: 30,
        cost: null,
        profit: null,
        status: "delivered",
        gross_revenue: 80,
        product_cost: 20,
        known_cost_revenue: 50,
        line_count: 2,
      },
    ]);

    expect(
      filterOrdersProfitability(report, {
        from: new Date("2026-08-01T00:00:00.000Z"),
      }),
    ).toMatchObject({
      grossRevenue: 50,
      productCost: 20,
      grossProfit: 30,
      knownCostRevenue: 50,
      lineCount: 1,
    });
  });
});

describe("ordersProfitabilityQuery", () => {
  it("binds range dates before aggregation and row selection", () => {
    const from = new Date("2026-08-01T04:00:00.000Z");
    const to = new Date("2026-08-22T03:59:59.999Z");
    const serialized = JSON.stringify(
      ordersProfitabilityQuery({ from, to }),
      (_, value) => (value instanceof Date ? value.toISOString() : value),
    );

    expect(serialized).toContain("and date >=");
    expect(serialized).toContain("and date <=");
    expect(serialized).toContain(from.toISOString());
    expect(serialized).toContain(to.toISOString());
    expect(serialized.indexOf("and date >=")).toBeLessThan(
      serialized.indexOf("from effective_lines"),
    );
  });
});
