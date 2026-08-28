import { describe, expect, it } from "vitest";

import { DEFAULT_LANDING_PAGE_CONTENT } from "./default-content";
import { parseLandingPageContent } from "./schema";

describe("landing page content schema", () => {
  it("accepts the deployment-safe default", () => {
    const result = parseLandingPageContent(DEFAULT_LANDING_PAGE_CONTENT);
    if (!result.success) throw new Error(JSON.stringify(result.error.issues));
    expect(result.success).toBe(true);
  });

  it("rejects unsafe links, duplicate ordering, and unknown fields", () => {
    const content = structuredClone(DEFAULT_LANDING_PAGE_CONTENT);
    content.hero.primaryCta.href = "javascript:alert(1)";
    expect(parseLandingPageContent(content).success).toBe(false);

    const duplicateOrder = structuredClone(DEFAULT_LANDING_PAGE_CONTENT);
    duplicateOrder.sectionOrder[1] = "marketing_banners";
    expect(parseLandingPageContent(duplicateOrder).success).toBe(false);

    expect(
      parseLandingPageContent({
        ...DEFAULT_LANDING_PAGE_CONTENT,
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it("migrates old announcement links and accepts older documents", () => {
    const content = structuredClone(DEFAULT_LANDING_PAGE_CONTENT) as {
      announcement: unknown;
    };
    content.announcement = {
      enabled: true,
      text: "Conocé la próxima edición",
      href: "",
      linkLabel: "Ver más",
    };
    const parsed = parseLandingPageContent(content);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.announcement.display).toBe("stacked");
      expect(parsed.data.announcement.rotationIntervalSeconds).toBe(6);
      expect(parsed.data.announcement.items).toEqual([
        {
          id: "a0b3d0d8-1eb3-4bd9-b5a2-1a9b7fa93b61",
          text: "Conocé la próxima edición",
          href: null,
        },
      ]);
    }

    const olderDocument = structuredClone(DEFAULT_LANDING_PAGE_CONTENT) as {
      announcement?: unknown;
      sectionBackgrounds?: unknown;
      footer: { copyrightText?: string };
      hero: {
        primaryCta: { show?: boolean };
        secondaryCta: { show?: boolean };
      };
      sections: {
        partners: { items: Array<{ image?: unknown }> };
      };
    };
    delete olderDocument.announcement;
    delete olderDocument.sectionBackgrounds;
    delete olderDocument.sections.partners.items[0].image;
    delete olderDocument.footer.copyrightText;
    delete olderDocument.hero.primaryCta.show;
    delete olderDocument.hero.secondaryCta.show;
    const olderParsed = parseLandingPageContent(olderDocument);
    expect(olderParsed.success).toBe(true);
    if (olderParsed.success) {
      expect(olderParsed.data.footer.copyrightText).toBe(
        DEFAULT_LANDING_PAGE_CONTENT.footer.copyrightText,
      );
      expect(olderParsed.data.hero.primaryCta.show).toBe(true);
      expect(olderParsed.data.hero.secondaryCta.show).toBe(true);
      expect(olderParsed.data.sectionBackgrounds).toEqual({
        marketing_banners: "default",
        event_spotlight: "default",
        audience: "default",
        festival_family: "default",
        community: "default",
        partners: "default",
      });
    }
  });

  it("retires legacy X links from saved footer content", () => {
    const content = structuredClone(DEFAULT_LANDING_PAGE_CONTENT);
    content.footer.socialLinks.push({
      id: "f8de7956-88bd-426e-85be-55071e0f39e4",
      network: "x",
      label: "X",
      href: "https://x.com/glitter",
    });

    const parsed = parseLandingPageContent(content);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(
        parsed.data.footer.socialLinks.map((link) => link.network),
      ).not.toContain("x");
    }
  });

  it("migrates the legacy primary logo to the current brand asset", () => {
    const content = structuredClone(DEFAULT_LANDING_PAGE_CONTENT);
    content.footer.logo.url = "/img/landing-v4/logo-wordmark.png";

    const parsed = parseLandingPageContent(content);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.footer.logo).toEqual(
        DEFAULT_LANDING_PAGE_CONTENT.footer.logo,
      );
    }
  });

  it("accepts percentage-based image focal points and rejects invalid ones", () => {
    const content = structuredClone(DEFAULT_LANDING_PAGE_CONTENT);
    content.sections.community.gallery[0].image.focalPoint = { x: 24, y: 72 };
    content.sections.community.gallery[0].image.zoom = 1.75;
    const parsed = parseLandingPageContent(content);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(
        parsed.data.sections.community.gallery[0].image.focalPoint,
      ).toEqual({ x: 24, y: 72 });
      expect(parsed.data.sections.community.gallery[0].image.zoom).toBe(1.75);
    }

    content.sections.community.gallery[0].image.focalPoint = { x: 101, y: 72 };
    expect(parseLandingPageContent(content).success).toBe(false);

    const invalidZoom = structuredClone(DEFAULT_LANDING_PAGE_CONTENT);
    invalidZoom.sections.community.gallery[0].image.zoom = 0.9;
    expect(parseLandingPageContent(invalidZoom).success).toBe(false);
  });

  it("migrates the legacy generated gallery without replacing custom galleries", () => {
    const legacy = structuredClone(DEFAULT_LANDING_PAGE_CONTENT);
    legacy.sections.community.gallery = legacy.sections.community.gallery.map(
      (item, index) => ({
        ...item,
        image: {
          url: `/img/landing-v4/gallery-0${index + 1}.png`,
          alt: item.image.alt,
        },
      }),
    );
    const migrated = parseLandingPageContent(legacy);
    expect(migrated.success).toBe(true);
    if (migrated.success) {
      expect(migrated.data.sections.community.gallery[0].image.url).toBe(
        "/img/landing-carousel/hanon-show.png",
      );
    }

    const custom = structuredClone(legacy);
    custom.sections.community.gallery[0].image.url = "/custom/photo.jpg";
    const untouched = parseLandingPageContent(custom);
    expect(untouched.success).toBe(true);
    if (untouched.success) {
      expect(untouched.data.sections.community.gallery[0].image.url).toBe(
        "/custom/photo.jpg",
      );
    }
  });

  it("migrates the original numeric gallery filenames to the named assets", () => {
    const legacy = structuredClone(DEFAULT_LANDING_PAGE_CONTENT);
    legacy.sections.community.gallery[0].image.url =
      "/img/landing-carousel/21 1.jpg";
    legacy.sections.community.gallery[1].image.url =
      "/img/landing-carousel/29.jpg";

    const migrated = parseLandingPageContent(legacy);
    expect(migrated.success).toBe(true);
    if (migrated.success) {
      expect(migrated.data.sections.community.gallery[0].image.url).toBe(
        "/img/landing-carousel/hanon-show.png",
      );
      expect(migrated.data.sections.community.gallery[1].image.url).toBe(
        "/img/landing-carousel/silksong.png",
      );
    }
  });

  it("migrates the original festival cards to the immersive showcase content", () => {
    const legacy = structuredClone(DEFAULT_LANDING_PAGE_CONTENT);
    legacy.sections.festivalFamily.heading = "Una familia de tres festivales";
    legacy.sections.festivalFamily.body =
      "Tres experiencias, un mismo propósito: hacer brillar el talento independiente boliviano.";
    legacy.sections.festivalFamily.items[0].description = "Glitter 9na Edición";
    legacy.sections.festivalFamily.items[0].fallbackImage = {
      url: "/img/glitter/logo-glitter-382x160.png",
      alt: "Logo de Glitter",
    };
    const twinkler = legacy.sections.festivalFamily.items.find(
      (item) => item.festivalType === "twinkler",
    );
    if (!twinkler) throw new Error("Missing Twinkler fixture");
    twinkler.fallbackImage = {
      url: "/img/twinkler/twinkler-banner-1500x720.png",
      alt: "El mundo fantástico e ilustrado de Twinkler",
    };

    const migrated = parseLandingPageContent(legacy);
    expect(migrated.success).toBe(true);
    if (migrated.success) {
      expect(migrated.data.sections.festivalFamily.heading).toBe(
        "Tres festivales. Tres mundos.",
      );
      expect(
        migrated.data.sections.festivalFamily.items[0].fallbackImage.url,
      ).toBe("/img/landing-festivals/glitter-characters.png");
      expect(migrated.data.sections.festivalFamily.items[0].description).toBe(
        DEFAULT_LANDING_PAGE_CONTENT.sections.festivalFamily.items[0]
          .description,
      );
      expect(
        migrated.data.sections.festivalFamily.items.find(
          (item) => item.festivalType === "twinkler",
        )?.fallbackImage.url,
      ).toBe("/img/landing-festivals/cosplay-twinkler.png");
    }
  });

  it("migrates the previous festival photos to character artwork", () => {
    const legacy = structuredClone(DEFAULT_LANDING_PAGE_CONTENT);
    const glitter = legacy.sections.festivalFamily.items.find(
      (item) => item.festivalType === "glitter",
    );
    const festicker = legacy.sections.festivalFamily.items.find(
      (item) => item.festivalType === "festicker",
    );
    if (!glitter || !festicker) throw new Error("Missing festival fixtures");
    glitter.fallbackImage.url = "/img/landing-carousel/99 1.jpg";
    festicker.fallbackImage.url = "/img/festicker-banner.png";

    const migrated = parseLandingPageContent(legacy);
    expect(migrated.success).toBe(true);
    if (migrated.success) {
      const items = migrated.data.sections.festivalFamily.items;
      expect(
        items.find((item) => item.festivalType === "glitter")?.fallbackImage
          .url,
      ).toBe("/img/landing-festivals/glitter-characters.png");
      expect(
        items.find((item) => item.festivalType === "festicker")?.fallbackImage
          .url,
      ).toBe("/img/landing-festivals/festicker-characters.png");
    }
  });

  it("migrates legacy audience art to the current audience assets", () => {
    const legacy = structuredClone(DEFAULT_LANDING_PAGE_CONTENT);
    const artist = legacy.sections.audience.items.find(
      (item) => item.title === "Artista o expositor",
    );
    const visitor = legacy.sections.audience.items.find(
      (item) => item.title === "Visitante",
    );
    const sponsor = legacy.sections.audience.items.find(
      (item) => item.title === "Auspiciador",
    );
    if (!artist || !visitor) throw new Error("Missing audience card fixtures");
    if (!sponsor) throw new Error("Missing sponsor card fixture");
    artist.image = {
      url: "/img/landing-v4/audience-artist.png",
      alt: "Theo pintando una ilustración",
    };
    visitor.image = {
      url: "/img/landing-v4/audience-visitor.png",
      alt: "Theo visitando un festival",
    };
    sponsor.image = {
      url: "/img/landing-v4/audience-sponsor.png",
      alt: "Mascota de una marca aliada de Glitter",
    };
    sponsor.featured = true;

    const migrated = parseLandingPageContent(legacy);
    expect(migrated.success).toBe(true);
    if (migrated.success) {
      const migratedArtist = migrated.data.sections.audience.items.find(
        (item) => item.title === "Artista o expositor",
      );
      const migratedVisitor = migrated.data.sections.audience.items.find(
        (item) => item.title === "Visitante",
      );
      const migratedSponsor = migrated.data.sections.audience.items.find(
        (item) => item.title === "Auspiciador",
      );
      expect(migratedArtist?.image.url).toBe(
        "/img/landing-audiences/participants.png",
      );
      expect(migratedVisitor?.image.url).toBe(
        "/img/landing-audiences/visitors.png",
      );
      expect(migratedSponsor?.image.url).toBe(
        "/img/landing-audiences/sponsors.png",
      );
      expect(migratedSponsor?.featured).toBe(true);
    }
  });
});
