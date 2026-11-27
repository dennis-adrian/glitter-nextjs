import { describe, expect, it } from "vitest";

import { DEFAULT_LINKS_HEADER } from "@/app/lib/links/definitions";
import {
  LINKS_FALLBACK_DESCRIPTION,
  linksPageMetadata,
} from "@/app/lib/links/metadata";
import { SITE_DESCRIPTION } from "@/app/lib/site-metadata";

const AVATAR = "https://abc123.ufs.sh/f/foto-1";

describe("linksPageMetadata", () => {
  it("names the tab once with the stock header", () => {
    expect(linksPageMetadata(DEFAULT_LINKS_HEADER, "").title).toEqual({
      absolute: "Productora Glitter",
    });
    expect(linksPageMetadata(DEFAULT_LINKS_HEADER, "[Dev]").title).toEqual({
      absolute: "[Dev] Productora Glitter",
    });
  });

  it("follows a custom name with the site's, unless it already says it", () => {
    const header = { ...DEFAULT_LINKS_HEADER, title: "Glitter links" };
    expect(linksPageMetadata(header, "").title).toEqual({
      absolute: "Glitter links | Productora Glitter",
    });
    expect(linksPageMetadata(header, "[Prev]").title).toEqual({
      absolute: "[Prev] Glitter links | Productora Glitter",
    });
    expect(
      linksPageMetadata(
        { ...header, title: "Enlaces de la productora glitter" },
        "",
      ).title,
    ).toEqual({ absolute: "Enlaces de la productora glitter" });
  });

  it("shares the header's name, line and picture, with a small card for the picture", () => {
    const metadata = linksPageMetadata(
      {
        title: "Glitter links",
        description: "Festivales y más",
        avatarUrl: AVATAR,
      },
      "[Dev]",
    );
    expect(metadata.description).toBe("Festivales y más");
    expect(metadata.alternates).toEqual({ canonical: "/links" });
    expect(metadata.openGraph).toMatchObject({
      url: "/links",
      title: "Glitter links",
      description: "Festivales y más",
      images: [{ url: AVATAR, alt: "Glitter links" }],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary",
      title: "Glitter links",
      description: "Festivales y más",
      images: [{ url: AVATAR, alt: "Glitter links" }],
    });
  });

  it("falls back to the site's line and picture where the header has none", () => {
    const metadata = linksPageMetadata(
      { title: "Productora Glitter", description: "", avatarUrl: null },
      "",
    );
    const image = {
      url: "/opengraph-image.png",
      width: 1200,
      height: 630,
      type: "image/png",
      alt: "Productora Glitter",
    };
    expect(metadata.description).toBe(LINKS_FALLBACK_DESCRIPTION);
    expect(metadata.openGraph).toMatchObject({
      title: "Productora Glitter",
      description: SITE_DESCRIPTION,
      images: [image],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      description: SITE_DESCRIPTION,
      images: [image],
    });
  });
});
