import { describe, expect, it } from "vitest";

import {
  parseStoreOrdersQuery,
  storeOrdersQueryToSearchParams,
} from "@/app/lib/orders/query-schema";

describe("store order query schema", () => {
  it("normalizes a date range into the custom period", () => {
    expect(
      parseStoreOrdersQuery({
        status: "paid",
        period: "month",
        from: "2026-08-01",
        q: "  Antonieta  ",
      }),
    ).toMatchObject({
      status: "paid",
      period: "custom",
      from: "2026-08-01",
      q: "Antonieta",
    });
  });

  it("falls back to safe defaults for invalid filters", () => {
    expect(
      parseStoreOrdersQuery({ status: "surprise", rental: "unknown" }),
    ).toMatchObject({
      status: "pending",
      rental: "all",
      period: "all",
      q: "",
      view: "compact",
    });
  });

  it("round-trips canonical filters to URL parameters", () => {
    const query = parseStoreOrdersQuery({
      status: "all",
      rental: "has_rental",
      period: "week",
      q: "Rosa",
    });

    expect(storeOrdersQueryToSearchParams(query).toString()).toBe(
      "status=all&rental=has_rental&period=week&view=compact&q=Rosa",
    );
  });

  it("preserves composable status filters", () => {
    const query = parseStoreOrdersQuery({
      status: "pending",
      statuses: "paid, pending,invalid,paid",
    });

    expect(query.statuses).toBe("paid,pending");
    expect(storeOrdersQueryToSearchParams(query).get("statuses")).toBe(
      "paid,pending",
    );
  });
});
