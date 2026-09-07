import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import { haveSameClockTimes } from "@/app/components/festival-terms/public-hours";

function at(isoLocal: string): DateTime {
  return DateTime.fromISO(isoLocal, { zone: "America/La_Paz" });
}

describe("haveSameClockTimes", () => {
  it("is true when both days share the same start and end clock times", () => {
    expect(
      haveSameClockTimes(
        at("2026-08-15T10:00:00"),
        at("2026-08-16T10:00:00"),
        at("2026-08-15T18:00:00"),
        at("2026-08-16T18:00:00"),
      ),
    ).toBe(true);
  });

  it("is false when day-two start differs", () => {
    expect(
      haveSameClockTimes(
        at("2026-08-15T10:00:00"),
        at("2026-08-16T11:00:00"),
        at("2026-08-15T18:00:00"),
        at("2026-08-16T18:00:00"),
      ),
    ).toBe(false);
  });

  it("is false when day-two end differs", () => {
    expect(
      haveSameClockTimes(
        at("2026-08-15T10:00:00"),
        at("2026-08-16T10:00:00"),
        at("2026-08-15T18:00:00"),
        at("2026-08-16T19:00:00"),
      ),
    ).toBe(false);
  });

  it("is false when any day is missing", () => {
    expect(
      haveSameClockTimes(
        at("2026-08-15T10:00:00"),
        null,
        at("2026-08-15T18:00:00"),
        null,
      ),
    ).toBe(false);
  });
});
