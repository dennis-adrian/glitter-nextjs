/**
 * Normalize a categoría label for matching and uniqueness checks.
 * Lowercase, strip accents, treat `/` and extra spaces as equivalent.
 * Keep in sync with `CANONICAL_LABEL_SQL` used in migrations.
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

/**
 * Postgres expression matching `normalizeCategoryLabel` for migration preflight.
 * Combining-mark strip uses the combining-diacritical-mark blocks that `\p{M}`
 * removes after NFD, not only U+0300–U+036F.
 */
export const CANONICAL_LABEL_SQL = `trim(regexp_replace(regexp_replace(lower(regexp_replace(normalize("name", NFD), U&'[\\0300-\\036F\\1AB0-\\1AFF\\1DC0-\\1DFF\\20D0-\\20FF\\FE20-\\FE2F]', '', 'g')), '[/]+', ' ', 'g'), '[[:space:]]+', ' ', 'g'))`;

export type CanonicalLabelDuplicate = {
  category: string;
  canonical: string;
  ids: number[];
  labels: string[];
};

export function findCanonicalLabelDuplicates(
  rows: readonly { id: number; category: string; label: string }[],
): CanonicalLabelDuplicate[] {
  const groups = new Map<string, CanonicalLabelDuplicate>();
  for (const row of rows) {
    const canonical = normalizeCategoryLabel(row.label);
    const key = `${row.category}:${canonical}`;
    const existing = groups.get(key);
    if (existing) {
      existing.ids.push(row.id);
      existing.labels.push(row.label);
      continue;
    }
    groups.set(key, {
      category: row.category,
      canonical,
      ids: [row.id],
      labels: [row.label],
    });
  }
  return [...groups.values()].filter((group) => group.ids.length > 1);
}

export function formatCanonicalDuplicateReport(
  duplicates: readonly CanonicalLabelDuplicate[],
): string {
  return duplicates
    .map(
      (duplicate) =>
        `area=${duplicate.category} canonical=${duplicate.canonical} ids=${duplicate.ids.join(",")} labels=${duplicate.labels
          .map((label) => JSON.stringify(label))
          .join(",")}`,
    )
    .join("\n");
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
