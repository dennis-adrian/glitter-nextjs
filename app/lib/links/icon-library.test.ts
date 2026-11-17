// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ICON_LIBRARY_SIZE,
  libraryIconSvg,
  searchLibraryIcons,
} from "@/app/lib/links/icon-library";

describe("the icon library", () => {
  it("holds both libraries", () => {
    expect(ICON_LIBRARY_SIZE).toBeGreaterThan(4000);
  });

  it("finds an icon of either library by name, the closest first", () => {
    const camera = searchLibraryIcons("camera");
    expect(camera[0]).toMatchObject({ ref: "lucide:camera", label: "Camera" });

    const spotify = searchLibraryIcons("Spotify");
    expect(spotify.map((icon) => icon.ref)).toContain("si:spotify");
    expect(spotify.find((icon) => icon.ref === "si:spotify")?.label).toBe(
      "Spotify",
    );
  });

  it("ignores case, accents, spaces and dashes", () => {
    expect(searchLibraryIcons("  Tik Tok ").map((icon) => icon.ref)).toContain(
      "si:tiktok",
    );
    expect(searchLibraryIcons("shopping-cart")[0].ref).toBe(
      "lucide:shopping-cart",
    );
    expect(searchLibraryIcons("cámera")[0].ref).toBe("lucide:camera");
  });

  it("answers nothing for an empty search and keeps to its limit", () => {
    expect(searchLibraryIcons("")).toEqual([]);
    expect(searchLibraryIcons("   ")).toEqual([]);
    expect(searchLibraryIcons("a", 10)).toHaveLength(10);
    expect(searchLibraryIcons("zzzzzzzzzz")).toEqual([]);
  });

  it("draws a brand's mark filled and a Lucide icon stroked", async () => {
    const spotify = await libraryIconSvg("si:spotify");
    expect(spotify).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24" fill="currentColor"><path d="[^"]+"\/><\/svg>$/,
    );

    const camera = await libraryIconSvg("lucide:camera");
    expect(camera).toContain('stroke="currentColor"');
    expect(camera).toContain("<circle");
    expect(camera).not.toContain("key=");
  });

  it("draws only shapes: no script, no handler, nothing from the name", async () => {
    for (const ref of ["si:spotify", "lucide:camera", "lucide:shopping-cart"]) {
      const svg = (await libraryIconSvg(ref)) ?? "";
      expect(svg).not.toMatch(/<script|on[a-z]+=|href=|<foreignObject/i);
    }
  });

  it.each([
    "lucide:no-such-icon",
    "si:no-such-brand",
    "lucide:constructor",
    "lucide:__proto__",
    "si:../../etc/passwd",
    "tabler:camera",
    "camera",
    "",
  ])("has no drawing for %j", async (ref) => {
    expect(await libraryIconSvg(ref)).toBeNull();
  });
});
