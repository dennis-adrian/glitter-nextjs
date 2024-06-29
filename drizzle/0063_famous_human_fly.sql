DO $$ BEGIN
 CREATE TYPE "festival_type" AS ENUM('glitter', 'twinkler');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN "festival_type" "festival_type" DEFAULT 'glitter' NOT NULL;