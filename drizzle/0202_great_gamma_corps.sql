CREATE TYPE "public"."storage_cleanup_job_status" AS ENUM('pending', 'completed');--> statement-breakpoint
CREATE TABLE "storage_cleanup_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer,
	"file_url" text NOT NULL,
	"status" "storage_cleanup_job_status" DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "storage_cleanup_jobs_status_idx" ON "storage_cleanup_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "storage_cleanup_jobs_entity_idx" ON "storage_cleanup_jobs" USING btree ("entity_type","entity_id");