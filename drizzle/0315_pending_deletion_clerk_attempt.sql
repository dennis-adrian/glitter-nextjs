-- Profile deletions: remember a Clerk deletion whose outcome is not known, so
-- a later "the login still exists" never releases an account whose earlier
-- request may still land.
ALTER TABLE "pending_user_deletions" ADD COLUMN IF NOT EXISTS "clerk_attempted_at" timestamp;
--> statement-breakpoint
-- Rows the earlier code left unfinished carry no record of whether it sent
-- Clerk a deletion (the cron did before checking anything, and recorded only
-- its error). Each is treated as having sent one when it last changed, so a
-- refusal releases it only once Clerk confirms the login still exists, never
-- straight away.
UPDATE "pending_user_deletions"
SET "clerk_attempted_at" = "updated_at"
WHERE "clerk_attempted_at" IS NULL
  AND "clerk_deleted_at" IS NULL
  AND "local_deleted_at" IS NULL;
