// @vitest-environment node

import { describe, expect, it } from "vitest";

import { festivalDayRuns } from "@/app/lib/festival-days";

const runs = (dates: Date[]) =>
  festivalDayRuns(dates).map((run) => run.map((day) => day.toISODate()));

describe("festivalDayRuns", () => {
  it("splits La Paz days into runs of consecutive days", () => {
    expect(
      runs([
        new Date("2026-12-27T16:00:00Z"),
        new Date("2026-12-19T16:00:00Z"),
        new Date("2026-12-18T16:00:00Z"),
        new Date("2026-12-20T16:00:00Z"),
      ]),
    ).toEqual([["2026-12-18", "2026-12-19", "2026-12-20"], ["2026-12-27"]]);
  });

  it("dedupes, reads La Paz's calendar and runs across a month", () => {
    expect(
      runs([
        // 23:30 on the 30th in La Paz, already the 1st in UTC.
        new Date("2026-12-01T03:30:00Z"),
        new Date("2026-11-30T16:00:00Z"),
        new Date("2026-12-01T16:00:00Z"),
      ]),
    ).toEqual([["2026-11-30", "2026-12-01"]]);
    expect(runs([])).toEqual([]);
  });
});
