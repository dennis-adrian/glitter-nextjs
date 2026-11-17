-- The /links page, the one address Glitter's social profiles point to in place
-- of a Linktree, managed from /dashboard/links: its links and social icons
-- (`site_links`) and the page's own settings (`site_links_settings`).
--
-- One file for the whole feature, and safe to run on a database in any state:
-- one that has none of it, one that has part of it (this was four migrations
-- while it was built, and a database may have run some), or one that has all
-- of it. Every statement only adds what is missing.
--
-- `site_links`. `kind` is `link` (a card in the list) or `social` (an icon in
-- the row of profiles). The table is seeded with the Linktree's links and
-- social icons at the time of the move, so the page does not start empty. The
-- seed goes in with the statement that creates the table and only then: a
-- rerun finds the table and restores nothing, even after someone has removed
-- every link.
DO $$
BEGIN
	IF to_regclass('site_links') IS NULL THEN
		CREATE TABLE "site_links" (
			"id" serial PRIMARY KEY NOT NULL,
			"kind" text DEFAULT 'link' NOT NULL,
			"label" text NOT NULL,
			"href" text NOT NULL,
			"icon" text DEFAULT 'link' NOT NULL,
			"sort_order" integer DEFAULT 0 NOT NULL,
			"is_visible" boolean DEFAULT true NOT NULL,
			"click_count" integer DEFAULT 0 NOT NULL,
			"updated_at" timestamp DEFAULT now() NOT NULL,
			"created_at" timestamp DEFAULT now() NOT NULL
		);
		INSERT INTO "site_links" ("kind", "label", "href", "icon", "sort_order")
		VALUES
			('link', 'Quiz de Personalidad Glitter', 'https://quiz.productoraglitter.com/glitter', 'sparkles', 0),
			('link', 'Tiendita', '/store', 'store', 1),
			('link', 'Sitio web', '/', 'website', 2),
			('link', 'TikTok', 'https://www.tiktok.com/@glitter.bo', 'tiktok', 3),
			('link', 'Festival Glitter', 'https://www.instagram.com/glitter.bo/', 'instagram', 4),
			('link', 'Correo', 'mailto:info@productoraglitter.com', 'email', 5),
			('social', 'Instagram', 'https://www.instagram.com/glitter.bo', 'instagram', 0),
			('social', 'TikTok', 'https://www.tiktok.com/@glitter.bo', 'tiktok', 1),
			('social', 'Facebook', 'https://www.facebook.com/glitterfestival', 'facebook', 2);
	END IF;
END $$;
--> statement-breakpoint
-- A link's thumbnail. `icon_svg` is the drawing of an icon picked from the
-- whole Lucide and Simple Icons libraries, kept as picked. `image_url` is an
-- image shown in place of the icon: a file of ours on UploadThing.
ALTER TABLE "site_links" ADD COLUMN IF NOT EXISTS "icon_svg" text;--> statement-breakpoint
ALTER TABLE "site_links" ADD COLUMN IF NOT EXISTS "image_url" text;--> statement-breakpoint
-- How a link's card is drawn: `classic` (thumbnail beside the title) or
-- `featured` (its thumbnail large, the title under it).
ALTER TABLE "site_links" ADD COLUMN IF NOT EXISTS "layout" text DEFAULT 'classic' NOT NULL;--> statement-breakpoint
-- A link's schedule: shown from one instant until another, either left open.
ALTER TABLE "site_links" ADD COLUMN IF NOT EXISTS "visible_from" timestamp;--> statement-breakpoint
ALTER TABLE "site_links" ADD COLUMN IF NOT EXISTS "visible_until" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_links_kind_sort_order_idx" ON "site_links" USING btree ("kind","sort_order");--> statement-breakpoint
-- One social icon per network. The first version of this migration had no
-- index for it, and a database that ran that one could hold two icons of the
-- same network (two admins adding it at once), which the index below would
-- refuse to be built over. So before it: of each network's icons the first
-- stays an icon, and any other becomes a hidden link card, at the end of the
-- links, with its address and its clicks. Nothing is deleted; whoever manages
-- the page can show it or remove it. Changes nothing where there are no such
-- rows, which is every database once the index exists.
WITH "copies" AS (
	SELECT "id", ROW_NUMBER() OVER (PARTITION BY "icon" ORDER BY "id") AS "copy"
	FROM "site_links"
	WHERE "kind" = 'social'
), "extras" AS (
	SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS "place"
	FROM "copies"
	WHERE "copy" > 1
)
UPDATE "site_links"
SET "kind" = 'link',
	"is_visible" = false,
	"sort_order" = (
		SELECT COALESCE(MAX("sort_order"), -1) FROM "site_links" WHERE "kind" = 'link'
	) + "extras"."place",
	"updated_at" = now()
FROM "extras"
WHERE "site_links"."id" = "extras"."id";--> statement-breakpoint
-- One social icon per network, whatever two admins do at once.
CREATE UNIQUE INDEX IF NOT EXISTS "site_links_one_social_per_network" ON "site_links" USING btree ("icon") WHERE "site_links"."kind" = 'social';--> statement-breakpoint
-- Settings of the page as a whole: one row at most (id 1), none means the
-- defaults. Where the row of social icons goes, and the page's header (name,
-- line and picture), where null is the stock header.
CREATE TABLE IF NOT EXISTS "site_links_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"social_position" text DEFAULT 'top' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_links_settings" ADD COLUMN IF NOT EXISTS "title" text;--> statement-breakpoint
ALTER TABLE "site_links_settings" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "site_links_settings" ADD COLUMN IF NOT EXISTS "avatar_url" text;
