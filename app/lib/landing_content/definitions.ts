export const LANDING_PAGE_KEY = "home" as const;

export const LANDING_SECTION_KEYS = [
  "marketing_banners",
  "event_spotlight",
  "audience",
  "festival_family",
  "community",
  "partners",
] as const;

export type LandingSectionKey = (typeof LANDING_SECTION_KEYS)[number];
export type LandingFestivalType = "glitter" | "twinkler" | "festicker";
export type LandingSectionBackground = "default" | "none" | "purple" | "coral";

export type LinkContent = { label: string; href: string };
export type CardCtaContent = LinkContent & { show: boolean };
export type ImageContent = {
  url: string;
  alt: string;
  /** Percentage-based crop anchor; omitted values render centered. */
  focalPoint?: { x: number; y: number };
  /** Crop magnification; omitted values render at the cover baseline. */
  zoom?: number;
};

export type LandingPageContentV1 = {
  schemaVersion: 1;
  announcement: {
    display: "stacked" | "rotating";
    rotationIntervalSeconds: number;
    items: Array<{
      id: string;
      text: string;
      href: string | null;
    }>;
  };
  seo: { title: string; description: string; shareImageUrl: string | null };
  hero: {
    titleLead: string;
    titleAccent: string;
    body: string;
    image: ImageContent;
    primaryCta: CardCtaContent;
    secondaryCta: CardCtaContent;
  };
  sectionOrder: LandingSectionKey[];
  sectionBackgrounds: Record<LandingSectionKey, LandingSectionBackground>;
  sections: {
    marketingBanners: { enabled: boolean };
    eventSpotlight: {
      enabled: boolean;
      source: "active" | "selected";
      festivalId: number | null;
      primaryCtaLabel: string;
      showCta: boolean;
    };
    audience: {
      enabled: boolean;
      heading: string;
      items: Array<{
        id: string;
        title: string;
        description: string;
        image: ImageContent;
        cta: CardCtaContent;
        featured: boolean;
      }>;
    };
    festivalFamily: {
      enabled: boolean;
      heading: string;
      body: string;
      items: Array<{
        id: string;
        festivalType: LandingFestivalType;
        displayName: string;
        badge: string;
        description: string;
        fallbackImage: ImageContent;
        href: string | null;
        showCta: boolean;
      }>;
    };
    community: {
      enabled: boolean;
      heading: string;
      body: string;
      gallery: Array<{ id: string; image: ImageContent }>;
      testimonialHeading: string;
      testimonials: Array<{
        id: string;
        quote: string;
        name: string;
        role: string;
        image: ImageContent;
      }>;
    };
    partners: {
      enabled: boolean;
      heading: string;
      items: Array<{
        id: string;
        /** Accessible name and fallback when no logo is supplied. */
        name: string;
        image: ImageContent | null;
        href: string | null;
      }>;
      sponsorCta: {
        heading: string;
        body: string;
        image: ImageContent;
        email: string;
        emailLabel: string;
        buttonLabel: string;
        emailSubject: string;
        showButton: boolean;
      };
    };
  };
  footer: {
    logo: ImageContent;
    description: string;
    festivalLinks: LinkContent[];
    communityLinks: LinkContent[];
    contactEmail: string;
    location: string;
    copyrightText: string;
    socialLinks: Array<{
      id: string;
      network: "instagram" | "facebook" | "x" | "tiktok" | "other";
      label: string;
      href: string;
    }>;
  };
};
