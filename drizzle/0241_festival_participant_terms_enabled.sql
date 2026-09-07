ALTER TABLE "festivals" ADD COLUMN "participant_terms_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "festivals"
SET "participant_terms_enabled" = true
WHERE "status" IN ('published', 'active');