DO $$ BEGIN
 CREATE TYPE "stand_zone" AS ENUM('main', 'secondary');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "stands" ADD COLUMN "zone" "stand_zone" DEFAULT 'main' NOT NULL;