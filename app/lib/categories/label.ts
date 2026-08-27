/**
 * Normalize a categoría label for matching and uniqueness checks.
 * Lowercase, strip accents, treat `/` and extra spaces as equivalent.
 */
export function normalizeCategoryLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function labelsMatch(a: string, b: string): boolean {
  return normalizeCategoryLabel(a) === normalizeCategoryLabel(b);
}

/** Matches the unique index `(category, lower(name))` after the editor trims the label. */
export function uniqueLabelIndexKey(area: string, label: string): string {
  return `${area}:${label.trim().toLowerCase()}`;
}

export function labelContainsNormalized(label: string, needle: string): boolean {
  return normalizeCategoryLabel(label).includes(normalizeCategoryLabel(needle));
}
