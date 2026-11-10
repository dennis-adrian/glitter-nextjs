-- The links on /links, the page Glitter's social profiles point to in place
-- of a Linktree. Managed from /dashboard/links. `kind` is `link` (a card in
-- the list) or `social` (an icon in the row of profiles). Idempotent
-- (IF NOT EXISTS), as 0304, 0307, 0309 and 0310 are.
CREATE TABLE IF NOT EXISTS "site_links" (
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_links_kind_sort_order_idx" ON "site_links" USING btree ("kind","sort_order");
--> statement-breakpoint
-- Settings of the page as a whole: one row at most (id 1), none means the
-- defaults. For now, where the row of social icons goes.
CREATE TABLE IF NOT EXISTS "site_links_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"social_position" text DEFAULT 'top' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- The Linktree's links and social icons at the time of the move, so the page
-- is never empty. Only into an empty table: a rerun never restores what
-- someone removed.
INSERT INTO "site_links" ("kind", "label", "href", "icon", "sort_order")
SELECT v.kind, v.label, v.href, v.icon, v.sort_order
FROM (VALUES
	('link', 'Quiz de Personalidad Glitter', 'https://quiz.productoraglitter.com/glitter', 'sparkles', 0),
	('link', 'Tiendita', '/store', 'store', 1),
	('link', 'Sitio web', '/', 'website', 2),
	('link', 'TikTok', 'https://www.tiktok.com/@glitter.bo', 'tiktok', 3),
	('link', 'Festival Glitter', 'https://www.instagram.com/glitter.bo/', 'instagram', 4),
	('link', 'Correo', 'mailto:info@productoraglitter.com', 'email', 5),
	('social', 'Instagram', 'https://www.instagram.com/glitter.bo', 'instagram', 0),
	('social', 'TikTok', 'https://www.tiktok.com/@glitter.bo', 'tiktok', 1),
	('social', 'Facebook', 'https://www.facebook.com/glitterfestival', 'facebook', 2)
) AS v(kind, label, href, icon, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM "site_links");
