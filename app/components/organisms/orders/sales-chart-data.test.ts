import { describe, expect, it } from "vitest";

import { buildSalesChartData } from "@/app/components/organisms/orders/sales-chart-data";
import type {
  OrderStatus,
  OrderWithRelations,
} from "@/app/lib/orders/definitions";

function makeOrder(
  createdAt: string,
  totalAmount: number,
  {
    status = "paid",
    merchRevenue = totalAmount,
    suppliesRevenue = 0,
  }: {
    status?: OrderStatus;
    merchRevenue?: number;
    suppliesRevenue?: number;
  } = {},
): OrderWithRelations {
  const orderItems = [
    merchRevenue > 0
      ? {
          quantity: 1,
          priceAtPurchase: merchRevenue,
          storeCategoryAtPurchase: "merch",
        }
      : null,
    suppliesRevenue > 0
      ? {
          quantity: 1,
          priceAtPurchase: suppliesRevenue,
          storeCategoryAtPurchase: "supplies",
        }
      : null,
  ].filter(Boolean);

  return {
    createdAt: new Date(createdAt),
    totalAmount,
    status,
    orderItems,
  } as unknown as OrderWithRelations;
}

describe("sales chart data", () => {
  it("uses the full order history for an unbounded period", () => {
    const model = buildSalesChartData({
      orders: [
        makeOrder("2026-01-10T12:00:00-04:00", 20),
        makeOrder("2026-08-20T12:00:00-04:00", 30),
      ],
      category: "all",
      range: {},
      mode: "revenue",
      now: new Date("2026-08-24T12:00:00-04:00"),
    });

    expect(model.title).toContain("Todo el período");
    expect(model.data.reduce((sum, point) => sum + point.value, 0)).toBe(50);
  });

  it("excludes days outside partial boundary months", () => {
    const model = buildSalesChartData({
      orders: [
        makeOrder("2026-01-10T12:00:00-04:00", 10),
        makeOrder("2026-01-16T12:00:00-04:00", 20),
        makeOrder("2026-05-20T12:00:00-04:00", 30),
        makeOrder("2026-05-21T12:00:00-04:00", 40),
      ],
      category: "all",
      range: {
        from: new Date("2026-01-15T00:00:00-04:00"),
        to: new Date("2026-05-20T23:59:59.999-04:00"),
      },
      mode: "revenue",
    });

    expect(model.data.reduce((sum, point) => sum + point.value, 0)).toBe(50);
  });

  it("sums only matching effective lines in a category scope", () => {
    const model = buildSalesChartData({
      orders: [
        makeOrder("2026-08-20T12:00:00-04:00", 50, {
          merchRevenue: 20,
          suppliesRevenue: 30,
        }),
      ],
      category: "supplies",
      range: {
        from: new Date("2026-08-20T00:00:00-04:00"),
        to: new Date("2026-08-20T23:59:59.999-04:00"),
      },
      mode: "revenue",
    });

    expect(model.data).toHaveLength(1);
    expect(model.data[0]?.value).toBe(30);
  });
});
