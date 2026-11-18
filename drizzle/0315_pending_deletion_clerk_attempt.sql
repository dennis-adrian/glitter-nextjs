-- Profile deletions: remember a Clerk deletion whose outcome is not known, so
-- a later "the login still exists" never releases an account whose earlier
-- request may still land. Nullable, no backfill: existing rows have no
-- unconfirmed attempt on record.
ALTER TABLE "pending_user_deletions" ADD COLUMN IF NOT EXISTS "clerk_attempted_at" timestamp;