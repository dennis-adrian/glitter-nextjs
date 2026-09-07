CREATE TYPE "public"."disciplinary_notification_job_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "disciplinary_notification_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"deduplication_key" text NOT NULL,
	"user_id" integer,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"notification_kind" text NOT NULL,
	"recipient_email" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "disciplinary_notification_job_status" DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sanction_festivals" ADD COLUMN "reservation_access_notification_queued_at" timestamp;--> statement-breakpoint
ALTER TABLE "disciplinary_notification_jobs" ADD CONSTRAINT "disciplinary_notification_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "disciplinary_notification_jobs_deduplication_key_unique" ON "disciplinary_notification_jobs" USING btree ("deduplication_key");--> statement-breakpoint
CREATE INDEX "disciplinary_notification_jobs_status_next_attempt_idx" ON "disciplinary_notification_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "disciplinary_notification_jobs_entity_idx" ON "disciplinary_notification_jobs" USING btree ("entity_type","entity_id");