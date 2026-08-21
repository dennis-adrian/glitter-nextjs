import { describe, expect, it } from "vitest";

import {
  parseStoreOrdersQuery,
  resolveStoreOrdersStatusFilter,
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

  it("discards calendar-invalid ISO dates as undefined", () => {
    const bothInvalid = parseStoreOrdersQuery({
      from: "2026-02-31",
      to: "2026-13-01",
    });
    expect(bothInvalid.from).toBeUndefined();
    expect(bothInvalid.to).toBeUndefined();
    expect(bothInvalid.period).toBe("all");

    const mixed = parseStoreOrdersQuery({
      period: "month",
      from: "2026-04-31",
      to: "2026-08-15",
    });
    expect(mixed.from).toBeUndefined();
    expect(mixed.to).toBe("2026-08-15");
    expect(mixed.period).toBe("custom");
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

  it("treats statuses=all as every order even when status defaults to pending", () => {
    const query = parseStoreOrdersQuery({ statuses: "all" });

    expect(query.status).toBe("pending");
    expect(query.statuses).toBe("all");
    expect(resolveStoreOrdersStatusFilter(query)).toBeUndefined();
  });

  it("expands needs_attention from statuses without falling back to status", () => {
    const query = parseStoreOrdersQuery({
      status: "paid",
      statuses: "needs_attention",
    });

    expect(resolveStoreOrdersStatusFilter(query)).toEqual([
      "pending",
      "payment_verification",
    ]);
  });

  it("falls back to query.status when statuses is empty", () => {
    expect(
      resolveStoreOrdersStatusFilter(parseStoreOrdersQuery({ status: "paid" })),
    ).toBe("paid");
    expect(
      resolveStoreOrdersStatusFilter(parseStoreOrdersQuery({ status: "all" })),
    ).toBeUndefined();
    expect(
      resolveStoreOrdersStatusFilter(
        parseStoreOrdersQuery({ status: "needs_attention" }),
      ),
    ).toEqual(["pending", "payment_verification"]);
  });

  it("uses expanded concrete statuses when statuses is set", () => {
    expect(
      resolveStoreOrdersStatusFilter(
        parseStoreOrdersQuery({
          status: "pending",
          statuses: "paid,delivered",
        }),
      ),
    ).toEqual(["paid", "delivered"]);
  });

  it("drops unknown statuses tokens before expanding", () => {
    expect(
      resolveStoreOrdersStatusFilter({
        status: "pending",
        statuses: "paid,not_a_status,delivered",
        rental: "all",
        period: "all",
        q: "",
        view: "compact",
      }),
    ).toEqual(["paid", "delivered"]);
    expect(
      resolveStoreOrdersStatusFilter({
        status: "paid",
        statuses: "bogus,needs_attention",
        rental: "all",
        period: "all",
        q: "",
        view: "compact",
      }),
    ).toEqual(["pending", "payment_verification"]);
    expect(
      resolveStoreOrdersStatusFilter({
        status: "paid",
        statuses: "unknown,all",
        rental: "all",
        period: "all",
        q: "",
        view: "compact",
      }),
    ).toBeUndefined();
  });
});
