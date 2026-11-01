-- 0303 gained comunicados.autosave_key after an earlier version of it had
-- already run on preview databases, which never re-run a recorded migration.
-- Idempotent, and it touches only the new comunicados table.
ALTER TABLE "comunicados" ADD COLUMN IF NOT EXISTS "autosave_key" text;
