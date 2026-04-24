CREATE TYPE "public"."marketing_banner_audience" AS ENUM('all', 'public_only', 'participants_only');--> statement-breakpoint
CREATE TABLE "marketing_banners" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_url" text NOT NULL,
	"href" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"audience" "marketing_banner_audience" DEFAULT 'all' NOT NULL,
	"open_in_new_tab" boolean DEFAULT false NOT NULL,
	"label" text,
	"alt_text" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "marketing_banners_sort_order_idx" ON "marketing_banners" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "marketing_banners_is_visible_idx" ON "marketing_banners" USING btree ("is_visible");