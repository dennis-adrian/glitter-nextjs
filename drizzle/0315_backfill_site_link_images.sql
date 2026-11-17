-- The images links and the header already show were made by the links page
-- (the actions accepted nothing else); record them before the foreign keys
-- that require it.
INSERT INTO "site_link_images" ("url")
SELECT "image_url" FROM "site_links" WHERE "image_url" IS NOT NULL
UNION
SELECT "avatar_url" FROM "site_links_settings" WHERE "avatar_url" IS NOT NULL
ON CONFLICT ("url") DO NOTHING;
