import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";

import { formatDate, formatDateOrNull, STORE_TIMEZONE } from "@/app/lib/formatters";

describe("formatDateOrNull", () => {
  it("returns a valid DateTime for parseable dates", () => {
    const result = formatDateOrNull("2026-08-15T10:00:00.000Z");
    expect(result).not.toBeNull();
    expect(result!.isValid).toBe(true);
    expect(result!.zoneName).toBe(STORE_TIMEZONE);
  });

  it("returns null for unparsable strings (invalid DateTimes are still truthy)", () => {
    const invalid = formatDate("not-a-date");
    expect(invalid).toBeTruthy();
    expect(invalid.isValid).toBe(false);
    expect(formatDateOrNull("not-a-date")).toBeNull();
  });

  it("preserves locale formatting for valid Date inputs", () => {
    const result = formatDateOrNull(new Date("2026-08-15T14:00:00.000Z"));
    expect(result).not.toBeNull();
    expect(result!.locale).toBe("es");
    expect(result!.toLocaleString(DateTime.TIME_24_SIMPLE)).toMatch(/\d{1,2}:\d{2}/);
  });
});
