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
UPDATE "subcategories" AS s
SET "name" = s."name" || ' [' || s."id"::text || ']'
FROM (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY "category", lower("name")
      ORDER BY id
    ) AS rn
  FROM "subcategories"
) AS d
WHERE s.id = d.id AND d.rn > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "subcategories_category_lower_label_unique" ON "subcategories" USING btree ("category", lower("name"));--> statement-breakpoint
CREATE INDEX "subcategories_visibility_category_sort_idx" ON "subcategories" USING btree ("visibility","category","sort_order");--> statement-breakpoint
ALTER TABLE "subcategories" DROP COLUMN "description";
