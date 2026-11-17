-- The links on /links, the page Glitter's social profiles point to in place
-- of a Linktree. Managed from /dashboard/links. `kind` is `link` (a card in
-- the list) or `social` (an icon in the row of profiles). Idempotent
-- (IF NOT EXISTS), as 0304, 0307, 0309 and 0310 are.
--
-- The table is seeded with the Linktree's links and social icons at the time
-- of the move, so the page does not start empty. The seed goes in with the
-- statement that creates the table and only then: a rerun finds the table and
-- restores nothing, even after someone has removed every link.
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
CREATE INDEX IF NOT EXISTS "site_links_kind_sort_order_idx" ON "site_links" USING btree ("kind","sort_order");
--> statement-breakpoint
-- One social icon per network, whatever two admins do at once.
CREATE UNIQUE INDEX IF NOT EXISTS "site_links_one_social_per_network" ON "site_links" USING btree ("icon") WHERE "site_links"."kind" = 'social';
--> statement-breakpoint
-- Settings of the page as a whole: one row at most (id 1), none means the
-- defaults. For now, where the row of social icons goes.
CREATE TABLE IF NOT EXISTS "site_links_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"social_position" text DEFAULT 'top' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
