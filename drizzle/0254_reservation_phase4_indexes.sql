-- Duplicate cleanup only. Concurrent index builds cannot run inside
-- drizzle-orm migrate()'s transaction; scripts/migrate.ts adds the
-- Phase 4 indexes after that transaction commits.
DELETE FROM "stand_subcategories" AS duplicate
USING "stand_subcategories" AS keeper
WHERE duplicate.id > keeper.id
  AND duplicate.stand_id = keeper.stand_id
  AND duplicate.subcategory_id = keeper.subcategory_id;
