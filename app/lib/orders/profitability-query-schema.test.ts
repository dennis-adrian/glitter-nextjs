import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import {
  getPreviousDateRange,
  getProfitabilityDateRange,
  parseProfitabilityQuery,
  profitabilityQueryToSearchParams,
} from "@/app/lib/orders/profitability-query-schema";

describe("profitability query schema", () => {
  it("uses the current month by default", () => {
    const query = parseProfitabilityQuery({});
    expect(query).toEqual({ period: "month", category: "all" });

    const now = DateTime.fromISO("2026-08-21T12:00:00", {
      zone: "America/La_Paz",
    });
    const range = getProfitabilityDateRange(query, now);
    expect(range.from?.toISOString()).toBe("2026-08-01T04:00:00.000Z");
    expect(range.to?.toISOString()).toBe("2026-08-22T03:59:59.999Z");
  });

  it("falls back to the current month when custom has no boundaries", () => {
    const query = parseProfitabilityQuery({ period: "custom" });
    expect(query).toEqual({ period: "month", category: "all" });

    const now = DateTime.fromISO("2026-08-21T12:00:00", {
      zone: "America/La_Paz",
    });
    const range = getProfitabilityDateRange(query, now);
    expect(range.from?.toISOString()).toBe("2026-08-01T04:00:00.000Z");
    expect(range.to?.toISOString()).toBe("2026-08-22T03:59:59.999Z");
  });

  it("discards calendar-invalid ISO dates as undefined", () => {
    const bothInvalid = parseProfitabilityQuery({
      from: "2026-02-31",
      to: "2026-13-01",
    });
    expect(bothInvalid.from).toBeUndefined();
    expect(bothInvalid.to).toBeUndefined();
    expect(bothInvalid.period).toBe("month");

    const customWithoutValidBounds = parseProfitabilityQuery({
      period: "custom",
      from: "2026-02-31",
      to: "2026-13-01",
    });
    expect(customWithoutValidBounds.from).toBeUndefined();
    expect(customWithoutValidBounds.to).toBeUndefined();
    expect(customWithoutValidBounds.period).toBe("month");

    const mixed = parseProfitabilityQuery({
      period: "custom",
      from: "2026-04-31",
      to: "2026-08-15",
    });
    expect(mixed.from).toBeUndefined();
    expect(mixed.to).toBe("2026-08-15");
    expect(mixed.period).toBe("custom");
  });

  it("canonicalizes explicit boundaries as a custom range", () => {
    const query = parseProfitabilityQuery({
      period: "week",
      from: "2026-08-01",
      to: "2026-08-15",
    });

    expect(query).toEqual({
      period: "custom",
      from: "2026-08-01",
      to: "2026-08-15",
      category: "all",
    });
    expect(profitabilityQueryToSearchParams(query).toString()).toBe(
      "period=custom&category=all&from=2026-08-01&to=2026-08-15",
    );
  });

  it("keeps the category scope alongside the period filters", () => {
    expect(parseProfitabilityQuery({ category: "bogus" }).category).toBe("all");

    const query = parseProfitabilityQuery({
      category: "supplies",
      from: "2026-08-01",
      to: "2026-08-15",
    });

    expect(query.category).toBe("supplies");
    expect(query.period).toBe("custom");
    const params = profitabilityQueryToSearchParams(query);
    expect(params.get("category")).toBe("supplies");
    expect(params.get("from")).toBe("2026-08-01");
    expect(params.get("to")).toBe("2026-08-15");
  });

  it("builds the immediately preceding equal-length comparison range", () => {
    const current = {
      from: new Date("2026-08-10T04:00:00.000Z"),
      to: new Date("2026-08-20T03:59:59.999Z"),
    };

    expect(getPreviousDateRange(current)).toEqual({
      from: new Date("2026-07-31T04:00:00.000Z"),
      to: new Date("2026-08-10T03:59:59.999Z"),
    });
  });

  it("does not invent a comparison for a one-sided or unbounded range", () => {
    expect(getPreviousDateRange({})).toBeNull();
    expect(
      getPreviousDateRange({ from: new Date("2026-08-01T04:00:00.000Z") }),
    ).toBeNull();
    expect(
      getPreviousDateRange({ to: new Date("2026-08-20T03:59:59.999Z") }),
    ).toBeNull();
  });
});
