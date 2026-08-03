ALTER TABLE "pending_user_deletions" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_user_deletions" ADD COLUMN "next_attempt_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_user_deletions" ADD COLUMN "recipient_email" text;--> statement-breakpoint
ALTER TABLE "pending_user_deletions" ADD COLUMN "email_sent_at" timestamp;--> statement-breakpoint
CREATE INDEX "pending_user_deletions_retry_idx" ON "pending_user_deletions" USING btree ("local_deleted_at","next_attempt_at","attempts");--> statement-breakpoint
CREATE INDEX "pending_user_deletions_email_outbox_idx" ON "pending_user_deletions" USING btree ("local_deleted_at","email_sent_at");