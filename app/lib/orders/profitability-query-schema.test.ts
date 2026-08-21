import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import {
  getProfitabilityDateRange,
  parseProfitabilityQuery,
  profitabilityQueryToSearchParams,
} from "@/app/lib/orders/profitability-query-schema";

describe("profitability query schema", () => {
  it("uses the current month by default", () => {
    const query = parseProfitabilityQuery({});
    expect(query).toEqual({ period: "month" });

    const now = DateTime.fromISO("2026-08-21T12:00:00", {
      zone: "America/La_Paz",
    });
    const range = getProfitabilityDateRange(query, now);
    expect(range.from?.toISOString()).toBe("2026-08-01T04:00:00.000Z");
    expect(range.to?.toISOString()).toBe("2026-08-22T03:59:59.999Z");
  });

  it("falls back to the current month when custom has no boundaries", () => {
    const now = DateTime.fromISO("2026-08-21T12:00:00", {
      zone: "America/La_Paz",
    });
    const range = getProfitabilityDateRange({ period: "custom" }, now);
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
    });
    expect(profitabilityQueryToSearchParams(query).toString()).toBe(
      "period=custom&from=2026-08-01&to=2026-08-15",
    );
  });
});
