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

    const range = getProfitabilityDateRange(
      query,
      DateTime.fromISO("2026-08-21T12:00:00", {
        zone: "America/La_Paz",
      }),
    );
    expect(range.from?.toISOString()).toBe("2026-08-01T04:00:00.000Z");
    expect(range.to?.toISOString()).toBe("2026-08-22T03:59:59.999Z");
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
