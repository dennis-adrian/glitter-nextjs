import { describe, expect, it } from "vitest";

import { DEFAULT_PROGRAM_ARTWORK } from "@/app/lib/programs/artwork";
import {
  buildSessionMetadata,
  resolveSessionSocialImage,
} from "@/app/lib/programs/session-metadata";

const SESSION_ART = "https://utfs.io/f/session.png";
const PORTRAIT_A = "https://img.clerk.com/portrait-a.png";
const PORTRAIT_B = "https://utfs.io/f/portrait-b.png";
const BANNER = "https://utfs.io/f/banner.png";
const FOREIGN = "https://example.com/tracker.png";

function speaker(imageUrl: string | null) {
  return { speaker: { imageUrl } };
}

function source({
  imageUrl = null,
  portraits = [],
  bannerUrl,
}: {
  imageUrl?: string | null;
  portraits?: (string | null)[];
  /** Undefined for a standalone session, which has no program. */
  bannerUrl?: string | null;
}) {
  return {
    title: "Risografía",
    description: "Imprime tu primer fanzine.",
    imageUrl,
    sessionSpeakers: portraits.map(speaker),
    program: bannerUrl === undefined ? null : { bannerUrl },
  };
}

describe("resolveSessionSocialImage", () => {
  it("prefers the session's own artwork over portraits and the banner", () => {
    expect(
      resolveSessionSocialImage(
        source({
          imageUrl: SESSION_ART,
          portraits: [PORTRAIT_A],
          bannerUrl: BANNER,
        }),
      ),
    ).toBe(SESSION_ART);
  });

  it("falls back to the first allowed speaker portrait", () => {
    expect(
      resolveSessionSocialImage(
        source({
          portraits: [null, FOREIGN, PORTRAIT_A, PORTRAIT_B],
          bannerUrl: BANNER,
        }),
      ),
    ).toBe(PORTRAIT_A);
  });

  it("uses the program banner when there is no session art or portrait", () => {
    expect(
      resolveSessionSocialImage(
        source({ portraits: [null], bannerUrl: BANNER }),
      ),
    ).toBe(BANNER);
  });

  it("uses the placeholder for a standalone session with nothing else", () => {
    expect(resolveSessionSocialImage(source({}))).toBe(DEFAULT_PROGRAM_ARTWORK);
  });

  it("skips every candidate on a host outside the allow-list", () => {
    expect(
      resolveSessionSocialImage(
        source({
          imageUrl: FOREIGN,
          portraits: [FOREIGN],
          bannerUrl: FOREIGN,
        }),
      ),
    ).toBe(DEFAULT_PROGRAM_ARTWORK);
  });
});

describe("buildSessionMetadata", () => {
  it("titles a missing session generically", () => {
    expect(buildSessionMetadata(undefined)).toEqual({ title: "Sesión" });
  });

  it("carries the title, description and social image", () => {
    expect(buildSessionMetadata(source({ imageUrl: SESSION_ART }))).toEqual({
      title: "Risografía",
      description: "Imprime tu primer fanzine.",
      openGraph: {
        title: "Risografía",
        description: "Imprime tu primer fanzine.",
        images: [SESSION_ART],
      },
    });
  });

  it("leaves the description out rather than emitting null", () => {
    const metadata = buildSessionMetadata({
      ...source({}),
      description: null,
    });

    expect(metadata.description).toBeUndefined();
    expect(metadata.openGraph?.description).toBeUndefined();
  });
});
