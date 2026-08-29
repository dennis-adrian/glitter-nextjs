-- Unmatched hardcoded titles stay logged so they can be created by hand:
-- Ilustración, Crochet, Bisutería / Bijouteria, Arte en vidrio,
-- Arte en papel / Papercraft, Arte en madera, Arte en arcilla,
-- Porcelana fría, Diseño y confección, Encuadernación, Bordado, Pintura,
-- Libros y cómics, Coleccionables, Skincare, Gastronomía,
-- Sublimación colaborativa.
-- Ilustración Digital and Postres are inserted by scripts/backfill-categories.ts
-- if no matching row exists under the right área.

CREATE TYPE "public"."category_visibility" AS ENUM('hidden', 'listed', 'selectable');--> statement-breakpoint
ALTER TABLE "subcategories" ADD COLUMN "description_json" jsonb;--> statement-breakpoint
ALTER TABLE "subcategories" ADD COLUMN "description_html" text;--> statement-breakpoint
ALTER TABLE "subcategories" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "subcategories" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subcategories" ADD COLUMN "visibility" "category_visibility" DEFAULT 'selectable' NOT NULL;--> statement-breakpoint
ALTER TABLE "subcategories" ADD COLUMN "is_exclusive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subcategories" ADD COLUMN "is_admin_assignable_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "subcategories"
SET "description_json" = jsonb_build_array(
  jsonb_build_object(
    'id', 'legacy-' || "id"::text,
    'type', 'paragraph',
    'props', jsonb_build_object(
      'textColor', 'default',
      'backgroundColor', 'default',
      'textAlignment', 'left'
    ),
    'content', jsonb_build_array(
      jsonb_build_object(
        'type', 'text',
        'text', "description",
        'styles', '{}'::jsonb
      )
    ),
    'children', '[]'::jsonb
  )
),
"description_html" = '<p>' || replace(replace(replace("description", '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>'
WHERE "description" IS NOT NULL AND btrim("description") <> '' AND "description_html" IS NULL;--> statement-breakpoint
UPDATE "subcategories"
SET "is_exclusive" = true
WHERE lower("name") LIKE '%skincare%' OR lower("name") LIKE '%skin care%';--> statement-breakpoint
UPDATE "subcategories"
SET "is_admin_assignable_only" = true, "visibility" = 'listed'
WHERE translate(lower("name"), 'áéíóúüñ', 'aeiouun') LIKE '%sublimacion%';--> statement-breakpoint
-- Canonical label duplicate preflight (must succeed before unique index).
-- Uses the same canonicalization as normalizeCategoryLabel: NFD, strip combining
-- marks, lower, treat / and extra whitespace as equivalent.
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
    RAISE EXCEPTION 'Duplicate category labels under backfill canonicalization. Resolve before creating unique index:%', E'\n' || dup_report;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "subcategories_category_lower_label_unique" ON "subcategories" USING btree ("category", lower("name"));--> statement-breakpoint
CREATE INDEX "subcategories_visibility_category_sort_idx" ON "subcategories" USING btree ("visibility","category","sort_order");--> statement-breakpoint
ALTER TABLE "subcategories" DROP COLUMN "description";
