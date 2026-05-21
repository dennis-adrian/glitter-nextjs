ALTER TABLE "posts" ADD COLUMN "submitted_at" timestamp;
UPDATE "posts"
SET "submitted_at" = "updated_at"
WHERE "status" = 'submitted' AND "submitted_at" IS NULL;