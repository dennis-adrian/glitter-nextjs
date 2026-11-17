-- How a link's card is drawn on /links: `classic` (thumbnail beside the
-- title) or `featured` (its image large, the title under it). Idempotent, as
-- 0313 and 0314 are.
ALTER TABLE "site_links" ADD COLUMN IF NOT EXISTS "layout" text DEFAULT 'classic' NOT NULL;
