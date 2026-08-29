import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROGRAM_ARTWORK,
  isAllowedProgramArtworkUrl,
  resolveProgramArtwork,
} from "@/app/lib/programs/artwork";

describe("isAllowedProgramArtworkUrl", () => {
  it.each([
    "/img/banner-caceria-de-sellos.png",
    "/img/programs/program-banner-placeholder.svg",
  ])("allows same-origin public paths: %s", (url) => {
    expect(isAllowedProgramArtworkUrl(url)).toBe(true);
  });

  it.each([
    "//evil.example/img.png",
    "/img/with:colon.png",
    "/img\\windows.png",
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
    "uses the placeholder when the program has no allowed banner: %s",
    (bannerUrl) => {
      expect(resolveProgramArtwork(bannerUrl)).toBe(DEFAULT_PROGRAM_ARTWORK);
    },
  );
});
