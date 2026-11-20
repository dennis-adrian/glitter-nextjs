// @vitest-environment node

import { Settings } from "luxon";
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

  it("keeps days adjacent whatever the runtime's zone", () => {
    // Santiago skips 00:00 on 6 Sep 2026, so a day parsed on its clock
    // starts at 01:00 and sits 23 hours before the 7th.
    const zone = Settings.defaultZone;
    Settings.defaultZone = "America/Santiago";
    try {
      expect(
        runs([
          new Date("2026-09-06T16:00:00Z"),
          new Date("2026-09-07T16:00:00Z"),
        ]),
      ).toEqual([["2026-09-06", "2026-09-07"]]);
      expect(
        runs([
          new Date("2026-12-18T16:00:00Z"),
          new Date("2026-12-20T16:00:00Z"),
        ]),
      ).toEqual([["2026-12-18"], ["2026-12-20"]]);
    } finally {
      Settings.defaultZone = zone;
    }
  });
});
