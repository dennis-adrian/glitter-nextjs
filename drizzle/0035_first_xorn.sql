DO $$ BEGIN
 CREATE TYPE "festival_map_version" AS ENUM('v1', 'v2', 'v3');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN "maps_version" "festival_map_version" DEFAULT 'v1' NOT NULL;