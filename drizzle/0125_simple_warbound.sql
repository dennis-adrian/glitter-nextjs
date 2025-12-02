CREATE TYPE "public"."access_level" AS ENUM('public', 'festival_participants_only');--> statement-breakpoint
ALTER TABLE "festival_activities" ADD COLUMN "requires_proof" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "festival_activities" ADD COLUMN "proof_upload_limit_date" timestamp;--> statement-breakpoint
ALTER TABLE "festival_activities" ADD COLUMN "access_level" "access_level" DEFAULT 'public' NOT NULL;