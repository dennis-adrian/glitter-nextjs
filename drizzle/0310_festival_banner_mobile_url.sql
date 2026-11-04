-- 3:2 festival banner for phones, shown below the md breakpoint. NULL means
-- "use festival_banner_url (3:1)", so existing festivals keep today's output
-- and nothing is backfilled. Idempotent (IF NOT EXISTS), as 0304, 0307 and
-- 0309 are, so a preview database that ran an earlier version of it is not
-- broken.
ALTER TABLE "festivals" ADD COLUMN IF NOT EXISTS "festival_banner_mobile_url" text;
