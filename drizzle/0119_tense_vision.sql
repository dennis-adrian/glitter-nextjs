CREATE TYPE "public"."festival_activity_type" AS ENUM('stamp_passport', 'sticker_print');--> statement-breakpoint
ALTER TABLE "festival_activities" ADD COLUMN "type" "festival_activity_type" DEFAULT 'stamp_passport' NOT NULL;--> statement-breakpoint
ALTER TABLE "festival_activities" ADD COLUMN "activity_prize_url" text;