CREATE TABLE "merch_collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"image_url" text,
	"festival_id" integer,
	"is_visible" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "merch_collections_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
-- Preserve existing collection URLs (numeric IDs) and product memberships.
INSERT INTO "merch_collections" ("id", "name", "slug", "description", "image_url", "festival_id", "is_visible", "sort_order")
SELECT f.id, f.name, 'festival-' || f.id, f.description,
  COALESCE(NULLIF(f.festival_banner_url, ''), NULLIF(f.thumbnail_url, ''), NULLIF(f.poster_url, '')),
  f.id, f.status <> 'draft',
  (row_number() OVER (ORDER BY f.start_date DESC NULLS LAST, f.id DESC) - 1)::integer
FROM "festivals" f
WHERE EXISTS (SELECT 1 FROM "merch_collection_products" cp WHERE cp.festival_id = f.id);
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('merch_collections', 'id'), COALESCE((SELECT max(id) FROM "merch_collections"), 1), EXISTS (SELECT 1 FROM "merch_collections"));
--> statement-breakpoint
ALTER TABLE "merch_collection_products" RENAME COLUMN "festival_id" TO "collection_id";--> statement-breakpoint
ALTER TABLE "merch_collection_products" DROP CONSTRAINT "merch_collection_products_festival_id_festivals_id_fk";
--> statement-breakpoint
DROP INDEX "merch_collection_products_unique";--> statement-breakpoint
ALTER TABLE "merch_collections" ADD CONSTRAINT "merch_collections_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_collection_products" ADD CONSTRAINT "merch_collection_products_collection_id_merch_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."merch_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "merch_collection_products_unique" ON "merch_collection_products" USING btree ("collection_id","product_id");