ALTER TABLE "email_suppressions" ADD COLUMN "last_event_at" timestamp;--> statement-breakpoint
ALTER TABLE "email_suppressions" ADD COLUMN "lifted_at" timestamp;