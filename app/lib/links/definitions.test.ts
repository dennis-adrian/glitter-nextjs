import { describe, expect, it } from "vitest";

import {
  DEFAULT_LINKS_HEADER,
  isWithinSchedule,
  mailtoAddress,
  parseScheduleInput,
  scheduleLabel,
  scheduleState,
  toLinksHeader,
  toScheduleInput,
  parseSiteLinkHref,
  parseSocialValue,
  socialValueFromHref,
  toSiteLinkIcon,
} from "@/app/lib/links/definitions";

describe("parseSiteLinkHref", () => {
  it("keeps a path on this site and a full web address as typed", () => {
    expect(parseSiteLinkHref(" /store ")).toEqual({ ok: true, href: "/store" });
    expect(parseSiteLinkHref("https://www.tiktok.com/@glitter.bo")).toEqual({
      ok: true,
      href: "https://www.tiktok.com/@glitter.bo",
    });
  });

  it("completes a bare email and a bare domain", () => {
    expect(parseSiteLinkHref("info@productoraglitter.com")).toEqual({
      ok: true,
      href: "mailto:info@productoraglitter.com",
    });
    expect(parseSiteLinkHref("quiz.productoraglitter.com/glitter")).toEqual({
      ok: true,
      href: "https://quiz.productoraglitter.com/glitter",
    });
  });

  it("accepts a mailto address", () => {
    expect(parseSiteLinkHref("mailto:info@productoraglitter.com").ok).toBe(
      true,
    );
  });

  it.each([
    "",
    "   ",
    "javascript:alert(1)",
    "data:text/html,hola",
    "//evil.example",
    "/store\\x",
    "hola mundo",
    "mailto:nadie",
    "localhost",
  ])("refuses %j", (value) => {
    expect(parseSiteLinkHref(value).ok).toBe(false);
  });
});

describe("mailtoAddress", () => {
  it("gives the address of a mailto link only", () => {
    expect(
      mailtoAddress("mailto:info@productoraglitter.com?subject=Hola"),
    ).toBe("info@productoraglitter.com");
    expect(mailtoAddress("/store")).toBeNull();
  });
});

describe("toSiteLinkIcon", () => {
  it("falls back to the plain link icon for an unknown name", () => {
    expect(toSiteLinkIcon("tiktok")).toBe("tiktok");
    expect(toSiteLinkIcon("myspace")).toBe("link");
  });
});

describe("parseSocialValue", () => {
  it.each([
    ["instagram", "@glitter.bo", "https://www.instagram.com/glitter.bo"],
    ["instagram", "glitter.bo", "https://www.instagram.com/glitter.bo"],
    ["tiktok", "@glitter.bo", "https://www.tiktok.com/@glitter.bo"],
    ["facebook", "glitterfestival", "https://www.facebook.com/glitterfestival"],
    [
      "facebook",
      "https://www.facebook.com/glitterfestival",
      "https://www.facebook.com/glitterfestival",
    ],
    [
      "facebook",
      "facebook.com/glitterfestival",
      "https://facebook.com/glitterfestival",
    ],
    ["youtube", "https://youtube.com/@glitter", "https://youtube.com/@glitter"],
    ["whatsapp", "+591 700-00000", "https://wa.me/59170000000"],
    [
      "email",
      "info@productoraglitter.com",
      "mailto:info@productoraglitter.com",
    ],
    [
      "instagram",
      "https://instagram.com/glitter.bo/",
      "https://instagram.com/glitter.bo/",
    ],
  ] as const)("%s: %s", (network, value, href) => {
    expect(parseSocialValue(network, value)).toEqual({ ok: true, href });
  });

  it.each([
    ["instagram", ""],
    ["instagram", "con espacios"],
    ["instagram", "https://evil.example/glitter.bo"],
    ["tiktok", "https://www.instagram.com/glitter.bo"],
    ["facebook", "javascript:alert(1)"],
    ["whatsapp", "12345"],
    ["email", "nadie"],
  ] as const)("refuses %s: %j", (network, value) => {
    expect(parseSocialValue(network, value).ok).toBe(false);
  });
});

describe("socialValueFromHref", () => {
  it("gives back what parses to the same link", () => {
    const cases = [
      ["instagram", "https://www.instagram.com/glitter.bo", "@glitter.bo"],
      ["tiktok", "https://www.tiktok.com/@glitter.bo", "@glitter.bo"],
      ["whatsapp", "https://wa.me/59170000000", "+59170000000"],
      [
        "email",
        "mailto:info@productoraglitter.com",
        "info@productoraglitter.com",
      ],
      [
        "facebook",
        "https://www.facebook.com/glitterfestival",
        "https://www.facebook.com/glitterfestival",
      ],
    ] as const;
    for (const [network, href, value] of cases) {
      expect(socialValueFromHref(network, href)).toBe(value);
      expect(parseSocialValue(network, value)).toEqual({ ok: true, href });
    }
  });
});

describe("a link's schedule", () => {
  // Noon in Bolivia, 12 November 2026.
  const now = new Date("2026-11-12T16:00:00Z");
  const before = new Date("2026-11-01T04:00:00Z");
  const after = new Date("2026-11-20T13:00:00Z");

  it("reads a typed date as Bolivia's time, and writes it back the same", () => {
    const date = parseScheduleInput("2026-11-20T09:00");
    expect(date?.toISOString()).toBe("2026-11-20T13:00:00.000Z");
    expect(toScheduleInput(date)).toBe("2026-11-20T09:00");
    // Late at night in Bolivia is already the next day in UTC.
    expect(parseScheduleInput("2026-12-31T23:30")?.toISOString()).toBe(
      "2027-01-01T03:30:00.000Z",
    );
    expect(toScheduleInput(new Date("2027-01-01T03:30:00Z"))).toBe(
      "2026-12-31T23:30",
    );
  });

  it("takes an empty date for none, and refuses what is not a date", () => {
    expect(parseScheduleInput("")).toBeNull();
    expect(parseScheduleInput("   ")).toBeNull();
    expect(parseScheduleInput(null)).toBeNull();
    expect(parseScheduleInput(undefined)).toBeNull();
    expect(toScheduleInput(null)).toBe("");
    for (const value of [
      "mañana",
      "2026-11-20",
      "2026-11-20T09:00:00Z",
      "2026-13-40T09:00",
      "2026-11-20T09:00'; drop table site_links; --",
    ]) {
      expect(parseScheduleInput(value)).toBeUndefined();
    }
  });

  it("knows where a link is in its schedule", () => {
    const state = (visibleFrom: Date | null, visibleUntil: Date | null) =>
      scheduleState({ visibleFrom, visibleUntil }, now);
    expect(state(null, null)).toBe("always");
    expect(state(after, null)).toBe("upcoming");
    expect(state(before, null)).toBe("running");
    expect(state(null, after)).toBe("running");
    expect(state(before, after)).toBe("running");
    expect(state(null, before)).toBe("ended");
    // It starts at its first instant and is over at its last.
    expect(state(now, null)).toBe("running");
    expect(state(null, now)).toBe("ended");
  });

  it("shows a link only while its schedule runs, or when it has none", () => {
    const shown = (visibleFrom: Date | null, visibleUntil: Date | null) =>
      isWithinSchedule({ visibleFrom, visibleUntil }, now);
    expect(shown(null, null)).toBe(true);
    expect(shown(before, after)).toBe(true);
    expect(shown(after, null)).toBe(false);
    expect(shown(null, before)).toBe(false);
  });

  it("says it in a line for the dashboard, in Bolivia's time", () => {
    const label = (visibleFrom: Date | null, visibleUntil: Date | null) =>
      scheduleLabel({ visibleFrom, visibleUntil }, now);
    expect(label(null, null)).toBeNull();
    expect(label(after, null)).toMatch(/^Se mostrará desde el 20 nov.*09:00$/);
    expect(label(before, null)).toMatch(/^Se muestra desde el 1 nov.*00:00$/);
    expect(label(null, after)).toMatch(/^Se muestra hasta el 20 nov.*09:00$/);
    expect(label(null, before)).toMatch(/^Dejó de mostrarse el 1 nov/);
    expect(label(after, new Date("2026-11-30T13:00:00Z"))).toMatch(
      /^Se mostrará del 20 nov.* al 30 nov/,
    );
    // A date in another year says which.
    expect(label(new Date("2030-01-01T14:00:00Z"), null)).toMatch(
      /^Se mostrará desde el 1 ene.*2030.*10:00$/,
    );
    expect(label(after, null)).not.toMatch(/2026/);
  });
});

describe("toLinksHeader", () => {
  it("is the stock header when nothing is stored", () => {
    expect(toLinksHeader(null)).toEqual(DEFAULT_LINKS_HEADER);
    expect(
      toLinksHeader({ title: null, description: null, avatarUrl: null }),
    ).toEqual(DEFAULT_LINKS_HEADER);
  });

  it("takes what is stored, an empty line included", () => {
    expect(
      toLinksHeader({
        title: "Glitter Bolivia",
        description: "",
        avatarUrl: "https://app.ufs.sh/f/foto",
      }),
    ).toEqual({
      title: "Glitter Bolivia",
      description: "",
      avatarUrl: "https://app.ufs.sh/f/foto",
    });
  });

  it("never shows a page with no name", () => {
    expect(
      toLinksHeader({ title: "   ", description: null, avatarUrl: null }).title,
    ).toBe("Productora Glitter");
  });
});
