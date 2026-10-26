import { Settings } from "luxon";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultScheduleValue,
  parseStoreDateTimeLocal,
  toStoreDateTimeLocal,
} from "@/app/lib/schedule-time";

const ORIGINAL_ZONE = Settings.defaultZone;

/** A browser, or a laptop, on Tokyo's clock: 13 hours ahead of La Paz. */
function onTokyoTime() {
  vi.stubEnv("TZ", "Asia/Tokyo");
  Settings.defaultZone = "Asia/Tokyo";
  // The stub reached the clock this process reads local times with.
  expect(new Date("2026-10-31T13:00:00.000Z").getHours()).toBe(22);
}

afterEach(() => {
  vi.unstubAllEnvs();
  Settings.defaultZone = ORIGINAL_ZONE;
});

describe("parseStoreDateTimeLocal", () => {
  it("reads the time as La Paz's, whatever zone the browser is in", () => {
    expect(parseStoreDateTimeLocal("2026-10-31T09:00")?.toISOString()).toBe(
      "2026-10-31T13:00:00.000Z",
    );
    onTokyoTime();
    expect(parseStoreDateTimeLocal("2026-10-31T09:00")?.toISOString()).toBe(
      "2026-10-31T13:00:00.000Z",
    );
  });

  it("keeps La Paz's day when UTC has moved on", () => {
    expect(parseStoreDateTimeLocal("2026-10-31T22:30")?.toISOString()).toBe(
      "2026-11-01T02:30:00.000Z",
    );
  });

  it("is null for a value that is not a date and a time", () => {
    // What an unfinished datetime-local field reads.
    expect(parseStoreDateTimeLocal("")).toBeNull();
    expect(parseStoreDateTimeLocal("2026-10-31")).toBeNull();
    expect(parseStoreDateTimeLocal("2026-02-30T09:00")).toBeNull();
    expect(parseStoreDateTimeLocal("2026-10-31T25:00")).toBeNull();
  });
});

describe("toStoreDateTimeLocal", () => {
  it("writes the instant on La Paz's clock, whatever zone the browser is in", () => {
    const instant = new Date("2026-10-31T13:00:00.000Z");
    expect(toStoreDateTimeLocal(instant)).toBe("2026-10-31T09:00");
    onTokyoTime();
    expect(toStoreDateTimeLocal(instant)).toBe("2026-10-31T09:00");
  });

  it("round-trips with the parser", () => {
    onTokyoTime();
    const value = "2026-12-24T18:45";
    const instant = parseStoreDateTimeLocal(value);
    expect(instant).not.toBeNull();
    expect(toStoreDateTimeLocal(instant!)).toBe(value);
    expect(parseStoreDateTimeLocal(toStoreDateTimeLocal(instant!))).toEqual(
      instant,
    );
  });
});

describe("defaultScheduleValue", () => {
  it("is the next full hour plus one, on La Paz's clock", () => {
    // 10:12 in La Paz.
    expect(defaultScheduleValue(new Date("2026-10-26T14:12:00Z"))).toBe(
      "2026-10-26T12:00",
    );
    // 10:00 sharp gives the same.
    expect(defaultScheduleValue(new Date("2026-10-26T14:00:00Z"))).toBe(
      "2026-10-26T12:00",
    );
    expect(defaultScheduleValue(new Date("2026-10-26T14:59:59Z"))).toBe(
      "2026-10-26T12:00",
    );
  });

  it("rolls over to La Paz's next day, whatever zone the browser is in", () => {
    onTokyoTime();
    // 23:30 on the 31st in La Paz; already the 1st in Tokyo and in UTC.
    expect(defaultScheduleValue(new Date("2026-11-01T03:30:00Z"))).toBe(
      "2026-11-01T01:00",
    );
  });

  it("reads the clock when it is given no time", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-26T14:12:00Z"));
      expect(defaultScheduleValue()).toBe("2026-10-26T12:00");
    } finally {
      vi.useRealTimers();
    }
  });
});
