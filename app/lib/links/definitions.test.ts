import { describe, expect, it } from "vitest";

import {
  mailtoAddress,
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
