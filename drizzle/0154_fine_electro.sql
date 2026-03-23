CREATE TYPE "public"."proof_status" AS ENUM('pending_review', 'approved', 'rejected_resubmit', 'rejected_removed');--> statement-breakpoint
CREATE TYPE "public"."proof_type" AS ENUM('image', 'text', 'both');--> statement-breakpoint
ALTER TYPE "public"."festival_activity_type" ADD VALUE 'coupon_book';--> statement-breakpoint
ALTER TABLE "festival_activity_participant_proofs" ALTER COLUMN "image_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "festival_activities" ADD COLUMN "proof_type" "proof_type";--> statement-breakpoint
UPDATE "festival_activities"
SET "proof_type" = CASE
  WHEN "requires_proof" THEN 'image'::"public"."proof_type"
  ELSE NULL
END;--> statement-breakpoint
ALTER TABLE "festival_activity_participant_proofs" ADD COLUMN "promo_description" text;--> statement-breakpoint
ALTER TABLE "festival_activity_participant_proofs" ADD COLUMN "promo_conditions" text;--> statement-breakpoint
ALTER TABLE "festival_activity_participant_proofs" ADD COLUMN "proof_status" "proof_status" DEFAULT 'pending_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "festival_activity_participant_proofs" ADD COLUMN "admin_feedback" text;--> statement-breakpoint
ALTER TABLE "festival_activity_participants" ADD COLUMN "removed_at" timestamp;--> statement-breakpoint
ALTER TABLE "festival_activities" DROP COLUMN "requires_proof";