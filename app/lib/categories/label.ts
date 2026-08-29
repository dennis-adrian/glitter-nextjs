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
 *
 * Valid only on PostgreSQL 13+ (`normalize()`), UTF-8 `server_encoding`, and
 * `standard_conforming_strings=on` (Unicode escapes). Run
 * `CANONICAL_LABEL_ENVIRONMENT_SQL` first; it must reject unsupported environments
 * before this expression is executed.
 */
export const CANONICAL_LABEL_SQL = `trim(regexp_replace(regexp_replace(lower(regexp_replace(normalize("name", NFD), U&'[\\0300-\\036F\\1AB0-\\1AFF\\1DC0-\\1DFF\\20D0-\\20FF\\FE20-\\FE2F]', '', 'g')), '[/]+', ' ', 'g'), '[[:space:]]+', ' ', 'g'))`;

/**
 * PL/pgSQL checks that must run before `CANONICAL_LABEL_SQL`.
 * Keep in sync with the environment DO blocks in migrations 0236 and 0242.
 */
export const CANONICAL_LABEL_ENVIRONMENT_SQL = `IF current_setting('server_version_num')::integer < 130000 THEN
    RAISE EXCEPTION 'Canonical label preflight requires PostgreSQL 13 or newer. Found server_version_num=%', current_setting('server_version_num');
  END IF;
  IF current_setting('server_encoding') IS DISTINCT FROM 'UTF8' THEN
    RAISE EXCEPTION 'Canonical label preflight requires UTF-8 database encoding. Found %', current_setting('server_encoding');
  END IF;
  IF current_setting('standard_conforming_strings') IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Canonical label preflight requires standard_conforming_strings=on. Found %', current_setting('standard_conforming_strings');
  END IF;`;

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
