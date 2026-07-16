ALTER TYPE "public"."storage_cleanup_job_status" ADD VALUE 'processing' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."storage_cleanup_job_status" ADD VALUE 'failed';--> statement-breakpoint
DROP INDEX "storage_cleanup_jobs_status_idx";--> statement-breakpoint
ALTER TABLE "storage_cleanup_jobs" ADD COLUMN "next_attempt_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "storage_cleanup_jobs" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "storage_cleanup_jobs" ADD COLUMN "lease_expires_at" timestamp;--> statement-breakpoint
CREATE INDEX "storage_cleanup_jobs_status_next_attempt_idx" ON "storage_cleanup_jobs" USING btree ("status","next_attempt_at");