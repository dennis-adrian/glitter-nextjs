import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";

import {
  formatDate,
  formatDateOrNull,
  formatDisplayDate,
  formatDateTime,
  formatTime,
  STORE_TIMEZONE,
} from "@/app/lib/formatters";

describe("display date formatting", () => {
  it.each([
    ["2026-09-21T04:00:00Z", "12:00 AM"],
    ["2026-09-21T14:00:00Z", "10:00 AM"],
    ["2026-09-21T16:00:00Z", "12:00 PM"],
    ["2026-09-22T02:00:00Z", "10:00 PM"],
  ])("formats %s with an explicit day period", (date, expected) => {
    expect(formatTime(date)).toBe(expected);
    expect(formatTime(new Date(date))).toBe(expected);
    expect(formatTime(DateTime.fromISO(date, { zone: "Asia/Tokyo" }))).toBe(
      expected,
    );
  });

  it("uses the Bolivia calendar day and Spanish month", () => {
    expect(formatDateTime("2026-09-22T02:00:00Z")).toBe(
      "21 sept 2026, 10:00 PM",
    );
    expect(formatDisplayDate("2026-09-21")).toBe("21 sept 2026");
  });

  it("enforces 12-hour time even for old 24-hour presets", () => {
    expect(formatTime("2026-09-22T02:00:00Z", DateTime.TIME_24_SIMPLE)).toBe(
      "10:00 PM",
    );
  });

  it("preserves seconds when requested and handles invalid input", () => {
    expect(formatTime("2026-09-22T02:00:45Z", DateTime.TIME_WITH_SECONDS)).toBe(
      "10:00:45 PM",
    );
    expect(formatDateTime("invalid")).toBe("—");
  });
});

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
    expect(result!.toLocaleString(DateTime.TIME_24_SIMPLE)).toMatch(
      /\d{1,2}:\d{2}/,
    );
  });
});
