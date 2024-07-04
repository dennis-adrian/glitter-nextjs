DO $$ BEGIN
 CREATE TYPE "user_status" AS ENUM('verified', 'pending', 'rejected', 'banned');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" "user_status" DEFAULT 'pending' NOT NULL;