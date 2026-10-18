import { describe, expect, it } from "vitest";

import { buildDateStamp } from "@/app/lib/programs/date-stamp";

// 22:00 UTC is 18:00 in La Paz (UTC-4), the store's zone.
const OCT_1_EVENING = new Date("2026-10-01T22:00:00.000Z");
const OCT_3 = new Date("2026-10-03T22:00:00.000Z");
const NOV_2 = new Date("2026-11-02T22:00:00.000Z");

describe("buildDateStamp", () => {
  it("prints a single day with its time in the store's zone", () => {
    expect(buildDateStamp(OCT_1_EVENING, null, "time")).toEqual({
      primary: "1",
      secondary: "OCT",
      tertiary: "6:00 PM",
      dateTime: expect.stringContaining("2026-10-01T18:00"),
      label: "1 de octubre de 2026, 6:00 PM",
    });
  });

  it("keeps the store's day for a late-night UTC instant", () => {
    // 02:00 UTC on the 2nd is still the 1st in La Paz.
    const stamp = buildDateStamp(new Date("2026-10-02T02:00:00.000Z"));
    expect(stamp?.primary).toBe("1");
  });

  it("joins a range within one month", () => {
    const stamp = buildDateStamp(OCT_1_EVENING, OCT_3, "year");
    expect(stamp).toMatchObject({
      primary: "1–3",
      secondary: "OCT",
      tertiary: "2026",
      label: "del 1 de octubre al 3 de octubre de 2026",
    });
  });

  it("names both months when a range crosses one", () => {
    expect(buildDateStamp(OCT_1_EVENING, NOV_2)).toMatchObject({
      primary: "1–2",
      secondary: "OCT–NOV",
      tertiary: null,
    });
  });

  it("returns null without a start, so the caller can say it is pending", () => {
    expect(buildDateStamp(null)).toBeNull();
  });
});
