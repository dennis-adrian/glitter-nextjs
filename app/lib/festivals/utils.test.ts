// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { FestivalBase } from "@/app/lib/festivals/definitions";
import {
  formatFestivalDateRange,
  sortFestivalDates,
  sortFestivalsForAdmin,
} from "@/app/lib/festivals/utils";

// Midday UTC is the same calendar day in La Paz (UTC-4).
const day = (iso: string) => ({ startDate: new Date(`${iso}T16:00:00Z`) });

describe("formatFestivalDateRange", () => {
  it("is null without dates", () => {
    expect(formatFestivalDateRange([])).toBeNull();
  });

  it("names a single day", () => {
    expect(formatFestivalDateRange([day("2026-10-24")])).toBe("24 oct 2026");
  });

  it("shares the month when both days fall in it", () => {
    expect(
      formatFestivalDateRange([day("2026-10-25"), day("2026-10-24")]),
    ).toBe("24–25 oct 2026");
  });

  it("spans months and years", () => {
    expect(
      formatFestivalDateRange([day("2026-10-31"), day("2026-11-01")]),
    ).toBe("31 oct – 1 nov 2026");
    expect(
      formatFestivalDateRange([day("2026-12-31"), day("2027-01-01")]),
    ).toBe("31 dic 2026 – 1 ene 2027");
  });

  it("reads the day in the store's time zone", () => {
    // 02:00 UTC on the 25th is still the 24th in La Paz.
    expect(
      formatFestivalDateRange([{ startDate: new Date("2026-10-25T02:00:00Z") }]),
    ).toBe("24 oct 2026");
  });
});

describe("sortFestivalDates", () => {
  it("orders by start without mutating the input", () => {
    const dates = [day("2026-10-25"), day("2026-10-24")];
    expect(sortFestivalDates(dates).map((d) => d.startDate.getUTCDate())).toEqual([
      24, 25,
    ]);
    expect(dates[0]!.startDate.getUTCDate()).toBe(25);
  });
});

describe("sortFestivalsForAdmin", () => {
  type Row = FestivalBase & { festivalDates: { startDate: Date }[] };
  const festival = (
    id: number,
    status: FestivalBase["status"],
    dates: string[],
  ) =>
    ({ id, status, festivalDates: dates.map(day) }) as unknown as Row;

  it("puts running festivals first, then drafts, then the archive, newest first", () => {
    const sorted = sortFestivalsForAdmin([
      festival(1, "archived", ["2025-04-01"]),
      festival(2, "archived", ["2026-04-01"]),
      festival(3, "draft", []),
      festival(4, "active", ["2026-10-24"]),
      festival(5, "published", ["2026-12-01"]),
      festival(6, "draft", ["2027-02-01"]),
    ]);

    expect(sorted.map((f) => f.id)).toEqual([4, 5, 6, 3, 2, 1]);
  });

  it("falls back to the newest id when dates tie or are missing", () => {
    const sorted = sortFestivalsForAdmin([
      festival(1, "draft", []),
      festival(2, "draft", []),
    ]);
    expect(sorted.map((f) => f.id)).toEqual([2, 1]);
  });
});
