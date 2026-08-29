-- Canonical label environment preflight (must succeed before normalization SQL).
-- normalize() needs PostgreSQL 13+; Unicode escapes need standard_conforming_strings;
-- combining-mark classes assume UTF-8.
DO $$
BEGIN
  IF current_setting('server_version_num')::integer < 130000 THEN
    RAISE EXCEPTION 'Canonical label preflight requires PostgreSQL 13 or newer. Found server_version_num=%', current_setting('server_version_num');
  END IF;
  IF current_setting('server_encoding') IS DISTINCT FROM 'UTF8' THEN
    RAISE EXCEPTION 'Canonical label preflight requires UTF-8 database encoding. Found %', current_setting('server_encoding');
  END IF;
  IF current_setting('standard_conforming_strings') IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Canonical label preflight requires standard_conforming_strings=on. Found %', current_setting('standard_conforming_strings');
  END IF;
END $$;--> statement-breakpoint
-- Canonical label duplicate preflight for databases that already applied 0236.
-- Uses the same canonicalization as normalizeCategoryLabel. This migration only
-- adds image_file_key; it does not enforce canonical uniqueness. Labels that
-- already satisfy the shipped (category, lower(name)) index must not abort it.
DO $$
DECLARE
  dup_report text;
BEGIN
  SELECT string_agg(
    format(
      'area=%s canonical=%s ids=%s labels=%s',
      category::text,
      canonical,
      ids,
      labels
    ),
    E'\n'
    ORDER BY category::text, canonical
  )
  INTO dup_report
  FROM (
    SELECT
      category,
      canonical,
      string_agg(id::text, ',' ORDER BY id) AS ids,
      string_agg(quote_literal("name"), ',' ORDER BY id) AS labels
    FROM (
      SELECT
        id,
        category,
        "name",
        trim(regexp_replace(regexp_replace(lower(regexp_replace(normalize("name", NFD), U&'[\0300-\036F\1AB0-\1AFF\1DC0-\1DFF\20D0-\20FF\FE20-\FE2F]', '', 'g')), '[/]+', ' ', 'g'), '[[:space:]]+', ' ', 'g')) AS canonical
      FROM subcategories
    ) labeled
    GROUP BY category, canonical
    HAVING count(*) > 1
  ) dups;

  IF dup_report IS NOT NULL THEN
    RAISE WARNING 'Duplicate category labels under backfill canonicalization (not blocking this additive migration):%', E'\n' || dup_report;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "subcategories" ADD COLUMN "image_file_key" text;
