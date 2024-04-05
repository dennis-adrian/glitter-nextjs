DO $$ BEGIN
 CREATE TYPE "user_category" AS ENUM('none', 'illustration', 'gastronomy', 'entrepreneurship');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "category" "user_category" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verified" boolean DEFAULT false NOT NULL;