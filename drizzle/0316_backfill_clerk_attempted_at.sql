-- Profile deletions: rows the earlier code left unfinished carry no record of
-- whether it sent Clerk a deletion (the cron did before checking anything,
-- and recorded only its error). Each is treated as having sent one when it
-- last changed, so a refusal releases it only once Clerk confirms the login
-- still exists, never straight away.
--
-- Its own migration, not part of 0315: databases that already applied 0315
-- would otherwise never run it. Safe to run more than once.
UPDATE "pending_user_deletions"
SET "clerk_attempted_at" = "updated_at"
WHERE "clerk_attempted_at" IS NULL
  AND "clerk_deleted_at" IS NULL
  AND "local_deleted_at" IS NULL;
