-- A link's thumbnail on /links. `image_url` is an image shown in place of its
-- icon (a file of ours on UploadThing, uploaded or taken from the link's own
-- OpenGraph image). `icon_svg` is the drawing of an icon picked from the whole
-- Lucide and Simple Icons libraries, kept as picked. Idempotent, as 0313 is.
ALTER TABLE "site_links" ADD COLUMN IF NOT EXISTS "icon_svg" text;--> statement-breakpoint
ALTER TABLE "site_links" ADD COLUMN IF NOT EXISTS "image_url" text;
