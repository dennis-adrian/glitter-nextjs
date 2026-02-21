CREATE TYPE "public"."participation_type" AS ENUM('standard', 'live_activity');--> statement-breakpoint
ALTER TABLE "stands" ADD COLUMN "participation_type" "participation_type" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "participation_type" "participation_type" DEFAULT 'standard' NOT NULL;