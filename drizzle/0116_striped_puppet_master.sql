CREATE TYPE "public"."submition_status" AS ENUM('pending_review', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "participant_products" ADD COLUMN "submition_status" "submition_status" DEFAULT 'pending_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "participant_products" ADD COLUMN "submition_feedback" text;