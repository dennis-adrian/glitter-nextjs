DO $$ BEGIN
 CREATE TYPE "stand_orientation" AS ENUM('portrait', 'landscape');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "stand_status" AS ENUM('available', 'reserved', 'confirmed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stands" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text,
	"status" "stand_status" DEFAULT 'available' NOT NULL,
	"orientation" "stand_orientation" DEFAULT 'landscape' NOT NULL,
	"stand_number" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stand_label_idx" ON "stands" ("label");