DO $$ BEGIN
 CREATE TYPE "festival_status" AS ENUM('draft', 'published', 'active', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN "status" "festival_status" DEFAULT 'draft' NOT NULL;