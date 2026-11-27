import { describe, expect, it } from "vitest";

import {
  addDays,
  buildLinksStatistics,
  classifyReferrer,
  clickThroughRate,
  daysBetween,
  linksDay,
  percentChange,
  periodRange,
  toLinksSource,
  toStatsPeriod,
  type StatsLink,
} from "@/app/lib/links/statistics";

describe("classifyReferrer", () => {
  it.each([
    ["", "direct"],
    [null, "direct"],
    [undefined, "direct"],
    [
      "https://l.instagram.com/?u=https%3A%2F%2Fwww.glitter.com.bo",
      "instagram",
    ],
    ["https://www.instagram.com/glitter.bo/", "instagram"],
    ["https://lm.instagram.com/", "instagram"],
    ["android-app://com.instagram.android/", "instagram"],
    ["https://www.tiktok.com/@glitter.bo", "tiktok"],
    ["https://vm.tiktok.com/x", "tiktok"],
    ["android-app://com.zhiliaoapp.musically/", "tiktok"],
    ["https://m.facebook.com/", "facebook"],
    ["https://l.facebook.com/l.php?u=x", "facebook"],
    ["https://fb.me/x", "facebook"],
    ["https://www.google.com/", "other"],
    ["https://notinstagram.com/", "other"],
    ["https://instagram.com.evil.example/", "other"],
    ["not a url", "other"],
    ["ftp://instagram.com/", "other"],
    ["android-app://com.example.app/", "other"],
  ])("reads %j as %s", (referrer, source) => {
    expect(classifyReferrer(referrer)).toBe(source);
  });

  it("reads a page of this same site as direct", () => {
    expect(
      classifyReferrer(
        "https://www.glitter.com.bo/store",
        "www.glitter.com.bo",
      ),
    ).toBe("direct");
    expect(
      classifyReferrer("https://staging.glitter.com.bo/", "www.glitter.com.bo"),
    ).toBe("other");
  });
});

describe("toLinksSource", () => {
  it("keeps a source of the set and makes anything else other", () => {
    expect(toLinksSource("tiktok")).toBe("tiktok");
    expect(toLinksSource("direct")).toBe("direct");
    expect(toLinksSource("TikTok")).toBe("other");
    expect(toLinksSource("'; drop table x; --")).toBe("other");
    expect(toLinksSource(null)).toBe("other");
    expect(toLinksSource(undefined)).toBe("other");
  });
});

describe("linksDay", () => {
  it("is the day in Bolivia (UTC-4), not in UTC", () => {
    // 23:59 in La Paz is 03:59 the next day in UTC.
    expect(linksDay(new Date("2026-11-18T03:59:59.999Z"))).toBe("2026-11-17");
    // Midnight in La Paz.
    expect(linksDay(new Date("2026-11-18T04:00:00.000Z"))).toBe("2026-11-18");
    // Midnight UTC is still the evening before in La Paz.
    expect(linksDay(new Date("2026-11-18T00:00:00.000Z"))).toBe("2026-11-17");
  });

  it("crosses months and years", () => {
    expect(linksDay(new Date("2027-01-01T02:00:00Z"))).toBe("2026-12-31");
    expect(linksDay(new Date("2026-03-01T03:00:00Z"))).toBe("2026-02-28");
  });
});

describe("days", () => {
  it("adds days across a month and a leap day", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(daysBetween("2026-12-30", "2027-01-02")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  it("gives a period ending today and the one of the same length before", () => {
    expect(periodRange("2026-11-19", 7)).toEqual({
      from: "2026-11-13",
      to: "2026-11-19",
      previousFrom: "2026-11-06",
      previousTo: "2026-11-12",
    });
    expect(daysBetween("2026-11-13", "2026-11-19")).toHaveLength(7);
  });

  it("takes only the periods offered", () => {
    expect(toStatsPeriod("7")).toBe(7);
    expect(toStatsPeriod("90")).toBe(90);
    expect(toStatsPeriod(["7", "90"])).toBe(7);
    expect(toStatsPeriod("30")).toBe(28);
    expect(toStatsPeriod(undefined)).toBe(28);
  });
});

describe("rates", () => {
  it("has no click-through rate without views", () => {
    expect(clickThroughRate(0, 0)).toBeNull();
    expect(clickThroughRate(3, 0)).toBeNull();
    expect(clickThroughRate(0, 10)).toBe(0);
    expect(clickThroughRate(5, 20)).toBe(0.25);
    // One visit can tap several links.
    expect(clickThroughRate(30, 20)).toBe(1.5);
  });

  it("has no change from nothing", () => {
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
    expect(percentChange(15, 10)).toBe(0.5);
    expect(percentChange(5, 10)).toBe(-0.5);
  });
});

function statsLink(overrides: Partial<StatsLink>): StatsLink {
  return {
    id: 1,
    kind: "link",
    label: "Tiendita",
    isVisible: true,
    visibleFrom: null,
    visibleUntil: null,
    clickCount: 0,
    ...overrides,
  };
}

// 10:00 in La Paz on 2026-11-19.
const NOW = new Date("2026-11-19T14:00:00Z");

describe("buildLinksStatistics", () => {
  it("reads sensibly with no data at all", () => {
    const stats = buildLinksStatistics({
      period: 7,
      now: NOW,
      firstDay: null,
      views: [],
      clicks: [],
      links: [statsLink({ id: 1 }), statsLink({ id: 2, isVisible: false })],
    });
    expect(stats.totals).toEqual({ views: 0, taps: 0, ctr: null });
    expect(stats.previous).toBeNull();
    expect(stats.change).toEqual({ views: null, taps: null, ctr: null });
    expect(stats.daily).toHaveLength(7);
    expect(stats.daily.every((d) => d.views === 0 && d.taps === 0)).toBe(true);
    expect(stats.sources.every((s) => s.ctr === null)).toBe(true);
    // The hidden link had no taps, so it is not listed; nothing has a share.
    expect(stats.links).toEqual([
      expect.objectContaining({ id: 1, taps: 0, share: null, lifetime: 0 }),
    ]);
    expect(JSON.stringify(stats)).not.toContain("NaN");
  });

  it("sums the period, the sources, the days and each link", () => {
    const stats = buildLinksStatistics({
      period: 7,
      now: NOW,
      firstDay: "2026-11-01",
      views: [
        { day: "2026-11-19", source: "instagram", views: 30 },
        { day: "2026-11-18", source: "direct", views: 10 },
        // Before the period: only the comparison counts it.
        { day: "2026-11-12", source: "instagram", views: 20 },
        { day: "2026-11-12", source: "bogus", views: 0 },
      ],
      clicks: [
        { linkId: 1, day: "2026-11-19", source: "instagram", clicks: 6 },
        { linkId: 2, day: "2026-11-18", source: "direct", clicks: 2 },
        { linkId: null, day: "2026-11-18", source: "direct", clicks: 2 },
        { linkId: 1, day: "2026-11-10", source: "instagram", clicks: 5 },
      ],
      links: [
        statsLink({ id: 1, label: "Tiendita", clickCount: 900 }),
        statsLink({ id: 2, label: "Oculto", isVisible: false, clickCount: 4 }),
        statsLink({ id: 3, label: "Sin clics", clickCount: 50 }),
        statsLink({
          id: 4,
          kind: "social",
          label: "Instagram",
          clickCount: 12,
        }),
      ],
    });

    expect(stats.totals).toEqual({ views: 40, taps: 10, ctr: 0.25 });
    expect(stats.previous).toEqual({ views: 20, taps: 5, ctr: 0.25 });
    expect(stats.change.views).toBe(1);
    expect(stats.change.taps).toBe(1);
    expect(stats.change.ctr).toBe(0);

    expect(stats.daily.at(-1)).toEqual({
      day: "2026-11-19",
      views: 30,
      taps: 6,
    });
    expect(stats.daily.at(-2)).toEqual({
      day: "2026-11-18",
      views: 10,
      taps: 4,
    });

    expect(stats.sources.find((s) => s.source === "instagram")).toEqual({
      source: "instagram",
      views: 30,
      taps: 6,
      ctr: 0.2,
    });
    expect(stats.sources.find((s) => s.source === "direct")?.ctr).toBe(0.4);
    expect(stats.sources.find((s) => s.source === "tiktok")?.ctr).toBeNull();

    expect(stats.links.map((row) => [row.label, row.taps, row.share])).toEqual([
      ["Tiendita", 6, 0.6],
      ["Oculto", 2, 0.2],
      ["Enlaces eliminados", 2, 0.2],
      ["Sin clics", 0, 0],
      ["Instagram", 0, 0],
    ]);
    expect(stats.links[0].lifetime).toBe(900);
    expect(stats.links[1].hidden).toBe(true);
    expect(stats.links[2]).toMatchObject({ id: null, lifetime: null });
    expect(stats.links[4].kind).toBe("social");
  });

  it("does not compare with a period from before the statistics began", () => {
    const stats = buildLinksStatistics({
      period: 7,
      now: NOW,
      // Inside the previous period: it was not counted whole.
      firstDay: "2026-11-08",
      views: [{ day: "2026-11-19", source: "direct", views: 5 }],
      clicks: [],
      links: [],
    });
    expect(stats.previous).toBeNull();
    expect(stats.change).toEqual({ views: null, taps: null, ctr: null });
    expect(stats.totals.ctr).toBe(0);
  });

  it("does not compare with a previous period that starts on the first, partial day", () => {
    const input = {
      period: 7 as const,
      now: NOW,
      views: [{ day: "2026-11-19", source: "direct", views: 5 }],
      clicks: [],
      links: [],
    };
    // The previous period of the 7 days to 2026-11-19 starts on 2026-11-06.
    expect(
      buildLinksStatistics({ ...input, firstDay: "2026-11-06" }).previous,
    ).toBeNull();
    expect(
      buildLinksStatistics({ ...input, firstDay: "2026-11-05" }).previous,
    ).toEqual({ views: 0, taps: 0, ctr: null });
  });

  it("has no change in rate when either period had no views", () => {
    const stats = buildLinksStatistics({
      period: 7,
      now: NOW,
      firstDay: "2026-10-01",
      views: [{ day: "2026-11-19", source: "direct", views: 5 }],
      clicks: [],
      links: [],
    });
    expect(stats.previous).toEqual({ views: 0, taps: 0, ctr: null });
    expect(stats.change).toEqual({ views: null, taps: null, ctr: null });
  });

  it("treats a link outside its schedule as hidden", () => {
    const stats = buildLinksStatistics({
      period: 7,
      now: NOW,
      firstDay: "2026-11-01",
      views: [],
      clicks: [{ linkId: 5, day: "2026-11-15", source: "other", clicks: 1 }],
      links: [
        statsLink({
          id: 5,
          label: "Preventa",
          visibleUntil: new Date("2026-11-16T00:00:00Z"),
        }),
        statsLink({
          id: 6,
          label: "Próximo",
          visibleFrom: new Date("2026-12-01T00:00:00Z"),
        }),
      ],
    });
    expect(stats.links).toEqual([
      expect.objectContaining({ id: 5, hidden: true, taps: 1, share: 1 }),
    ]);
  });
});
