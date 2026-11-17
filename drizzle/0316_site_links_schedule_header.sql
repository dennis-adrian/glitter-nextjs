-- A schedule for each link on /links (shown from one instant until another,
-- either left open), and the page's own header (name, line and picture) in
-- its settings row, where null is the stock header. Idempotent, as 0313 to
-- 0315 are.
ALTER TABLE "site_links" ADD COLUMN IF NOT EXISTS "visible_from" timestamp;--> statement-breakpoint
ALTER TABLE "site_links" ADD COLUMN IF NOT EXISTS "visible_until" timestamp;--> statement-breakpoint
ALTER TABLE "site_links_settings" ADD COLUMN IF NOT EXISTS "title" text;--> statement-breakpoint
ALTER TABLE "site_links_settings" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "site_links_settings" ADD COLUMN IF NOT EXISTS "avatar_url" text;
