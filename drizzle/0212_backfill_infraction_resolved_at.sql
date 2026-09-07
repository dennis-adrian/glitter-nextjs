UPDATE "infractions"
SET "resolved_at" = "updated_at"
WHERE "handled" = true AND "resolved_at" IS NULL;
