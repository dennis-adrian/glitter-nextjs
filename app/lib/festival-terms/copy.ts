import type {
  TermsAudienceCategory,
  TermsFestivalType,
  TermsSectionKind,
  TermsSectionLayout,
} from "@/app/lib/festival-terms/definitions";

export const CATEGORY_LABELS: Record<TermsAudienceCategory, string> = {
  illustration: "Ilustración",
  gastronomy: "Gastronomía",
  entrepreneurship: "Emprendimiento",
};

export const FESTIVAL_TYPE_LABELS: Record<TermsFestivalType, string> = {
  glitter: "Glitter",
  twinkler: "Twinkler",
  festicker: "Festicker",
};

export const KIND_LABELS: Record<TermsSectionKind, string> = {
  rich_text: "Texto",
  schedule: "Horarios del festival",
};

export const LAYOUT_LABELS: Record<TermsSectionLayout, string> = {
  plain: "Sección simple",
  accordion: "Acordeón",
  card: "Tarjeta",
};

export function audienceSummary(
  categories: string[],
  festivalTypes: string[],
): string {
  const categoryPart =
    categories.length === 0
      ? "Todas las categorías"
      : categories
          .map((value) => CATEGORY_LABELS[value as TermsAudienceCategory] ?? value)
          .join(", ");
  const typePart =
    festivalTypes.length === 0
      ? "todos los tipos"
      : festivalTypes
          .map((value) => FESTIVAL_TYPE_LABELS[value as TermsFestivalType] ?? value)
          .join(", ");
  return `${categoryPart} · ${typePart}`;
}
