DO $$ BEGIN
 CREATE TYPE "event_discovery" AS ENUM('facebook', 'instagram', 'tiktok', 'cba', 'friends', 'participant_invitation', 'casual', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "gender" AS ENUM('male', 'female', 'non_binary', 'other', 'undisclosed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "visitors" ADD COLUMN "event_discovery" "event_discovery" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "visitors" ADD COLUMN "gender" "gender" DEFAULT 'undisclosed' NOT NULL;--> statement-breakpoint
ALTER TABLE "visitors" ADD COLUMN "birthdate" timestamp NOT NULL;