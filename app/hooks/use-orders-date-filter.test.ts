import { act, cleanup, renderHook } from "@testing-library/react";
import { DateTime } from "luxon";
import { afterEach, describe, expect, it } from "vitest";

import { STORE_TIMEZONE } from "@/app/lib/formatters";
import type { OrderWithRelations } from "@/app/lib/orders/definitions";

import { useOrdersDateFilter } from "./use-orders-date-filter";

afterEach(cleanup);

function order(createdAt: DateTime): OrderWithRelations {
  return { createdAt: createdAt.toJSDate() } as OrderWithRelations;
}

describe("useOrdersDateFilter", () => {
  const now = DateTime.now().setZone(STORE_TIMEZONE);
  const lastMonth = order(now.minus({ months: 1 }));
  const thisMonth = order(now);
  const orders = [lastMonth, thisMonth];

  it("keeps an empty custom range instead of falling back to the month cutoff", () => {
    const { result } = renderHook(() => useOrdersDateFilter(orders));

    act(() => {
      result.current.selectPeriod("custom");
    });

    expect(result.current.period).toBe("custom");
    expect(result.current.dateFrom).toBe("");
    expect(result.current.dateTo).toBe("");
    expect(result.current.filteredByDate).toEqual(orders);
  });

  it("still applies the month cutoff when period is month", () => {
    const { result } = renderHook(() => useOrdersDateFilter(orders));

    act(() => {
      result.current.selectPeriod("month");
    });

    expect(result.current.filteredByDate).toEqual([thisMonth]);
  });

  it("still returns every order when period is all", () => {
    const { result } = renderHook(() => useOrdersDateFilter(orders));

    expect(result.current.filteredByDate).toEqual(orders);
  });
});
