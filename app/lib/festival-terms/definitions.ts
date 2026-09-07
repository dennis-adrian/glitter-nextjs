import type {
  festivalTermsDocuments,
  festivalTermsSections,
  festivalTermsVersions,
} from "@/db/schema";

import type {
  TERMS_AUDIENCE_CATEGORIES,
  TERMS_FESTIVAL_TYPES,
  TERMS_SECTION_KINDS,
  TERMS_SECTION_LAYOUTS,
} from "@/app/lib/festival-terms/constants";

export type TermsAudienceCategory = (typeof TERMS_AUDIENCE_CATEGORIES)[number];
export type TermsFestivalType = (typeof TERMS_FESTIVAL_TYPES)[number];
export type TermsSectionKind = (typeof TERMS_SECTION_KINDS)[number];
export type TermsSectionLayout = (typeof TERMS_SECTION_LAYOUTS)[number];

export type FestivalTermsDocument = typeof festivalTermsDocuments.$inferSelect;
export type FestivalTermsVersion = typeof festivalTermsVersions.$inferSelect;
export type FestivalTermsSection = typeof festivalTermsSections.$inferSelect;

export type FestivalTermsVersionWithSections = FestivalTermsVersion & {
  sections: FestivalTermsSection[];
  publishedBy?: { id: number; displayName: string | null } | null;
  createdBy?: { id: number; displayName: string | null } | null;
};

export type FestivalTermsVersionSummary = FestivalTermsVersion & {
  publishedByDisplayName?: string | null;
  createdByDisplayName?: string | null;
  sectionCount: number;
};

export type SeedTermsSection = {
  sortOrder: number;
  kind: TermsSectionKind;
  layout: TermsSectionLayout;
  title: string | null;
  bodyJson: unknown[] | null;
  audienceCategories: TermsAudienceCategory[];
  audienceFestivalTypes: TermsFestivalType[];
};

export type EditorTermsSection = {
  clientId: string;
  kind: TermsSectionKind;
  layout: TermsSectionLayout;
  title: string;
  bodyJson: unknown;
  bodyHtml?: string | null;
  audienceCategories: TermsAudienceCategory[];
  audienceFestivalTypes: TermsFestivalType[];
};
