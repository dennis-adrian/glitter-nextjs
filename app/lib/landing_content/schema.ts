import { z } from "zod";

import { LANDING_SECTION_KEYS, type LandingPageContentV1 } from "./definitions";
import {
  DEFAULT_COMMUNITY_GALLERY,
  DEFAULT_LANDING_PAGE_CONTENT,
} from "./default-content";
import { normalizeLandingHref } from "./links";

const text = (max: number) => z.string().trim().min(1).max(max);
const id = z.string().uuid();
const safeHref = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => normalizeLandingHref(value) !== null, "URL no válida");
const nullableHref = z
  .preprocess(
    (value) => (typeof value === "string" && !value.trim() ? null : value),
    z.string().trim().max(2048).nullable(),
  )
  .refine(
    (value) => value === null || normalizeLandingHref(value) !== null,
    "URL no válida",
  );
const image = z.strictObject({
  url: safeHref,
  alt: text(240),
  focalPoint: z
    .strictObject({
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
    })
    .optional(),
  zoom: z.number().min(1).max(3).optional(),
});
const link = z.strictObject({ label: text(120), href: safeHref });
const cardCta = z.strictObject({
  label: text(120),
  href: safeHref,
  show: z.boolean().default(true),
});
const sectionBackground = z.enum(["default", "none", "purple", "coral"]);
const defaultSectionBackgrounds = {
  marketing_banners: "default",
  event_spotlight: "default",
  audience: "default",
  festival_family: "default",
  community: "default",
  partners: "default",
} as const;
const unique = <T extends { id: string }>(items: T[]) =>
  new Set(items.map((item) => item.id)).size === items.length;
const announcementItem = z.strictObject({
  id,
  text: text(240),
  href: nullableHref,
});
const announcement = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }
    const record = value as Record<string, unknown>;
    if ("items" in record) return value;
    const message = record.text;
    return {
      display: "stacked",
      rotationIntervalSeconds: 6,
      items:
        record.enabled === true && typeof message === "string" && message.trim()
          ? [
              {
                id: "a0b3d0d8-1eb3-4bd9-b5a2-1a9b7fa93b61",
                text: message,
                href: record.href ?? null,
              },
            ]
          : [],
    };
  },
  z
    .strictObject({
      display: z.enum(["stacked", "rotating"]).default("stacked"),
      rotationIntervalSeconds: z.number().int().min(3).max(60).default(6),
      items: z
        .array(announcementItem)
        .max(8)
        .refine(unique, "IDs de anuncios duplicados"),
    })
    .default({ display: "stacked", rotationIntervalSeconds: 6, items: [] }),
);

export const landingPageContentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  announcement,
  seo: z.strictObject({
    title: text(120),
    description: text(1000),
    shareImageUrl: safeHref.nullable(),
  }),
  hero: z.strictObject({
    titleLead: text(120),
    titleAccent: text(120),
    body: text(1000),
    image,
    primaryCta: cardCta,
    secondaryCta: cardCta,
  }),
  sectionOrder: z
    .array(z.enum(LANDING_SECTION_KEYS))
    .length(LANDING_SECTION_KEYS.length)
    .refine(
      (values) => new Set(values).size === LANDING_SECTION_KEYS.length,
      "Cada sección debe aparecer una vez",
    ),
  sectionBackgrounds: z
    .strictObject({
      marketing_banners: sectionBackground.default("default"),
      event_spotlight: sectionBackground.default("default"),
      audience: sectionBackground.default("default"),
      festival_family: sectionBackground.default("default"),
      community: sectionBackground.default("default"),
      partners: sectionBackground.default("default"),
    })
    .default(defaultSectionBackgrounds),
  sections: z.strictObject({
    marketingBanners: z.strictObject({ enabled: z.boolean() }),
    eventSpotlight: z
      .strictObject({
        enabled: z.boolean(),
        source: z.enum(["active", "selected"]),
        festivalId: z.number().int().positive().nullable(),
        primaryCtaLabel: text(120),
        showCta: z.boolean().default(true),
      })
      .superRefine((value, ctx) => {
        if ((value.source === "selected") !== (value.festivalId !== null))
          ctx.addIssue({
            code: "custom",
            message:
              "La fuente seleccionada requiere un festival y la automática no admite uno",
            path: ["festivalId"],
          });
      }),
    audience: z.strictObject({
      enabled: z.boolean(),
      heading: text(120),
      items: z
        .array(
          z.strictObject({
            id,
            title: text(120),
            description: text(1000),
            image,
            cta: cardCta,
            featured: z.boolean(),
          }),
        )
        .min(1)
        .max(4)
        .refine(unique, "IDs de audiencia duplicados"),
    }),
    festivalFamily: z.strictObject({
      enabled: z.boolean(),
      heading: text(120),
      body: text(1000),
      items: z
        .array(
          z.strictObject({
            id,
            festivalType: z.enum(["glitter", "twinkler", "festicker"]),
            displayName: text(120),
            badge: text(120),
            description: text(1000),
            fallbackImage: image,
            href: nullableHref,
            showCta: z.boolean().default(true),
          }),
        )
        .min(1)
        .max(3)
        .refine(unique, "IDs de festivales duplicados")
        .refine(
          (items) =>
            new Set(items.map((item) => item.festivalType)).size ===
            items.length,
          "Tipos de festival duplicados",
        ),
    }),
    community: z.strictObject({
      enabled: z.boolean(),
      heading: text(120),
      body: text(1000),
      gallery: z
        .array(z.strictObject({ id, image }))
        .min(1)
        .max(8)
        .refine(unique, "IDs de galería duplicados"),
      testimonialHeading: text(120),
      testimonials: z
        .array(
          z.strictObject({
            id,
            quote: text(1000),
            name: text(120),
            role: text(120),
            image,
          }),
        )
        .max(6)
        .refine(unique, "IDs de testimonios duplicados"),
    }),
    partners: z.strictObject({
      enabled: z.boolean(),
      heading: text(120),
      items: z
        .array(
          z.strictObject({
            id,
            name: text(120),
            image: image.nullable().default(null),
            href: nullableHref,
          }),
        )
        .max(20)
        .refine(unique, "IDs de aliados duplicados"),
      sponsorCta: z.strictObject({
        heading: text(120),
        body: text(1000),
        image,
        email: z.string().trim().email().max(254),
        emailLabel: text(120),
        buttonLabel: text(120),
        emailSubject: z.string().trim().max(120),
        showButton: z.boolean().default(true),
      }),
    }),
  }),
  footer: z.strictObject({
    logo: image,
    description: text(1000),
    festivalLinks: z.array(link).max(10),
    communityLinks: z.array(link).max(10),
    contactEmail: z.string().trim().email().max(254),
    location: text(240),
    copyrightText: text(500).default(
      "Productora Glitter. Todos los derechos reservados. Diseñado con amor en Santa Cruz, Bolivia.",
    ),
    socialLinks: z
      .array(
        z.strictObject({
          id,
          network: z.enum(["instagram", "facebook", "x", "tiktok", "other"]),
          label: text(120),
          href: safeHref,
        }),
      )
      .max(8)
      .refine(unique, "IDs sociales duplicados"),
  }),
});

export function parseLandingPageContent(value: unknown) {
  const result = landingPageContentSchema.safeParse(
    value,
  ) as z.ZodSafeParseResult<LandingPageContentV1>;
  if (
    result.success &&
    result.data.sections.community.gallery.length > 0 &&
    result.data.sections.community.gallery.every((item) =>
      /^\/img\/landing-v4\/gallery-\d+\.png$/.test(item.image.url),
    )
  ) {
    result.data.sections.community.gallery = DEFAULT_COMMUNITY_GALLERY.map(
      (item) => ({
        ...item,
        image: {
          ...item.image,
          focalPoint: item.image.focalPoint
            ? { ...item.image.focalPoint }
            : undefined,
          zoom: item.image.zoom,
        },
      }),
    );
  }
  if (result.success) {
    if (result.data.footer.logo.url === "/img/landing-v4/logo-wordmark.png") {
      result.data.footer.logo = {
        ...DEFAULT_LANDING_PAGE_CONTENT.footer.logo,
      };
    }

    result.data.footer.socialLinks = result.data.footer.socialLinks.filter(
      (link) => link.network !== "x",
    );

    const legacyAudienceImageTitles: Record<string, string> = {
      "/img/landing-v4/audience-artist.png": "Artista o expositor",
      "/img/landing-v4/audience-visitor.png": "Visitante",
      "/img/landing-v4/audience-sponsor.png": "Auspiciador",
      "/img/glitter-mascot-with-stand.png": "Auspiciador",
    };
    result.data.sections.audience.items.forEach((item) => {
      const title = legacyAudienceImageTitles[item.image.url];
      if (!title) return;
      const current = DEFAULT_LANDING_PAGE_CONTENT.sections.audience.items.find(
        (candidate) => candidate.title === title,
      );
      if (current) item.image = { ...current.image };
    });

    const section = result.data.sections.festivalFamily;
    if (section.heading === "Una familia de tres festivales") {
      section.heading =
        DEFAULT_LANDING_PAGE_CONTENT.sections.festivalFamily.heading;
    }
    if (
      section.body ===
      "Tres experiencias, un mismo propósito: hacer brillar el talento independiente boliviano."
    ) {
      section.body = DEFAULT_LANDING_PAGE_CONTENT.sections.festivalFamily.body;
    }

    const legacyFestivalDefaults = {
      glitter: {
        description: "Glitter 9na Edición",
        imageUrls: [
          "/img/glitter/logo-glitter-382x160.png",
          "/img/landing-carousel/99 1.jpg",
        ],
      },
      twinkler: {
        description: "Twinkler 3ra Edición",
        imageUrls: [
          "/img/twinkler/twinkler-v3-title.png",
          "/img/twinkler/twinkler-banner-1500x720.png",
        ],
      },
      festicker: {
        description: "Festicker 3ra Edición",
        imageUrls: [
          "/img/glitter/festicker-v2-logo-382x160.png",
          "/img/festicker-banner.png",
        ],
      },
    } as const;

    section.items.forEach((item) => {
      const legacy = legacyFestivalDefaults[item.festivalType];
      const current =
        DEFAULT_LANDING_PAGE_CONTENT.sections.festivalFamily.items.find(
          (candidate) => candidate.festivalType === item.festivalType,
        );
      if (!current) return;
      if (item.description === legacy.description) {
        item.description = current.description;
        item.badge = current.badge;
      }
      if (
        legacy.imageUrls.some(
          (legacyImageUrl) => item.fallbackImage.url === legacyImageUrl,
        )
      ) {
        item.fallbackImage = {
          ...current.fallbackImage,
          focalPoint: current.fallbackImage.focalPoint
            ? { ...current.fallbackImage.focalPoint }
            : undefined,
        };
      }
    });
    const festivalOrder = { glitter: 0, festicker: 1, twinkler: 2 } as const;
    section.items.sort(
      (a, b) => festivalOrder[a.festivalType] - festivalOrder[b.festivalType],
    );
  }
  return result;
}
