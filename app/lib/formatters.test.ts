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

describe("date with time", () => {
  // 14:12 UTC is 10:12 in Bolivia.
  const edited = "2026-10-25T14:12:00.000Z";

  // Newer ICU data joins a long date and a time with "a las"; older data
  // with a comma. The output must not depend on which one the runtime has.
  it("joins a long date and its time with a comma on every runtime", () => {
    expect(
      formatDisplayDate(edited, {
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
      }),
    ).toBe("25 de octubre, 10:12 AM");
  });

  it("keeps the medium preset as it was", () => {
    expect(formatDateTime(new Date("2026-10-24T22:02:00.000Z"))).toBe(
      "24 oct 2026, 6:02 PM",
    );
  });

  it("joins date and time styles the same way", () => {
    expect(
      formatDisplayDate(edited, { dateStyle: "long", timeStyle: "short" }),
    ).toBe("25 de octubre de 2026, 10:12 AM");
  });

  it("keeps a shared calendar on the date half of date and time styles", () => {
    expect(
      formatDisplayDate(edited, {
        dateStyle: "long",
        timeStyle: "short",
        calendar: "buddhist",
      }),
    ).toMatch(/^25 de octubre de 2569 .*, 10:12 AM$/);
  });

  it("gives a shared numbering system to both halves of date fields", () => {
    const formatted = formatDisplayDate(edited, {
      day: "numeric",
      month: "long",
      hour: "numeric",
      minute: "2-digit",
      numberingSystem: "arab",
    });

    expect(formatted).toMatch(/^٢٥ de octubre, ١٠:١٢ AM$/);
  });

  it("leaves a date alone, and a time alone", () => {
    expect(formatDisplayDate(edited, { day: "numeric", month: "long" })).toBe(
      "25 de octubre",
    );
    expect(formatTime(edited)).toBe("10:12 AM");
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
