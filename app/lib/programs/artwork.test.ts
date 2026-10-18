import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROGRAM_ARTWORK,
  isAllowedProgramArtworkUrl,
  resolveProgramArtwork,
} from "@/app/lib/programs/artwork";

describe("isAllowedProgramArtworkUrl", () => {
  it.each([
    "/img/glitter-mascot-with-stand.png",
    "/img/programs/program-banner-placeholder.svg",
  ])("allows same-origin public paths: %s", (url) => {
    expect(isAllowedProgramArtworkUrl(url)).toBe(true);
  });

  it.each([
    "//evil.example/img.png",
    "/img/with:colon.png",
    "/img\\windows.png",
    "img/banner.png",
    "/api/foo",
    "https://example.com/banner.jpg",
    "/img/../secret",
    "/img/foo/../../etc/passwd",
    "/img/%2e%2e/secret",
    "/img/%2e%2e%2fsecret",
  ])("rejects unsafe or remote-disallowed URLs: %s", (url) => {
    expect(isAllowedProgramArtworkUrl(url)).toBe(false);
  });
});

describe("DEFAULT_PROGRAM_ARTWORK", () => {
  it("is a same-origin PNG, not an SVG crawlers may skip", () => {
    expect(DEFAULT_PROGRAM_ARTWORK).toBe(
      "/img/programs/program-og-default.png",
    );
    expect(isAllowedProgramArtworkUrl(DEFAULT_PROGRAM_ARTWORK)).toBe(true);
  });

  it("exists under public/ at the 1200x630 og:image size", () => {
    const png = readFileSync(
      path.join(process.cwd(), "public", DEFAULT_PROGRAM_ARTWORK),
    );

    // The IHDR chunk stores width and height right after the 8-byte signature
    // and the chunk's length and type.
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
});

describe("resolveProgramArtwork", () => {
  it("uses the program banner from the database", () => {
    const bannerUrl = "https://glitter.ufs.sh/f/program-banner";

    expect(resolveProgramArtwork(bannerUrl)).toBe(bannerUrl);
  });

  it("keeps same-origin Storybook and placeholder paths", () => {
    expect(resolveProgramArtwork("/img/glitter-mascot-with-stand.png")).toBe(
      "/img/glitter-mascot-with-stand.png",
    );
  });

  it.each([null, undefined, "", "https://example.com/banner.jpg"])(
    "uses the default artwork when the program has no allowed banner: %s",
    (bannerUrl) => {
      expect(resolveProgramArtwork(bannerUrl)).toBe(
        "/img/programs/program-og-default.png",
      );
    },
  );
});
