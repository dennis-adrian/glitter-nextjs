import type { UserCategory } from "@/app/api/users/definitions";
import type { FestivalBase } from "@/app/lib/festivals/definitions";
import type {
  TermsAudienceCategory,
  TermsFestivalType,
} from "@/app/lib/festival-terms/definitions";

export function normalizeTermsCategory(
  category: UserCategory | null | undefined,
): TermsAudienceCategory | null {
  if (category === "illustration" || category === "new_artist") {
    return "illustration";
  }
  if (category === "gastronomy" || category === "entrepreneurship") {
    return category;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function sectionMatchesAudience(
  section: {
    audienceCategories?: unknown;
    audienceFestivalTypes?: unknown;
  },
  category: UserCategory | null | undefined,
  festivalType: FestivalBase["festivalType"] | null | undefined,
): boolean {
  const categories = asStringArray(section.audienceCategories);
  const festivalTypes = asStringArray(section.audienceFestivalTypes);
  const normalized = normalizeTermsCategory(category);

  const categoryOk =
    categories.length === 0 ||
    (normalized != null &&
      categories.includes(normalized as TermsAudienceCategory));
  const typeOk =
    festivalTypes.length === 0 ||
    (festivalType != null &&
      festivalTypes.includes(festivalType as TermsFestivalType));

  return categoryOk && typeOk;
}

export function filterSectionsForAudience<
  T extends {
    audienceCategories?: unknown;
    audienceFestivalTypes?: unknown;
    sortOrder?: number;
  },
>(
  sections: T[],
  category: UserCategory | null | undefined,
  festivalType: FestivalBase["festivalType"] | null | undefined,
): T[] {
  return [...sections]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .filter((section) =>
      sectionMatchesAudience(section, category, festivalType),
    );
}
