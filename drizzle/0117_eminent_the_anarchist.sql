ALTER TYPE "public"."submition_status" RENAME TO "submission_status";--> statement-breakpoint
ALTER TABLE "participant_products" RENAME COLUMN "submition_status" TO "submission_status";--> statement-breakpoint
ALTER TABLE "participant_products" RENAME COLUMN "submition_feedback" TO "submission_feedback";