import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROGRAM_ARTWORK,
  resolveProgramArtwork,
} from "@/app/lib/programs/artwork";

describe("resolveProgramArtwork", () => {
  it("uses the program banner from the database", () => {
    const bannerUrl = "https://glitter.ufs.sh/f/program-banner";

    expect(resolveProgramArtwork(bannerUrl)).toBe(bannerUrl);
  });

  it.each([null, undefined, "", "https://example.com/banner.jpg"])(
    "uses the placeholder when the program has no allowed banner: %s",
    (bannerUrl) => {
      expect(resolveProgramArtwork(bannerUrl)).toBe(DEFAULT_PROGRAM_ARTWORK);
    },
  );
});
