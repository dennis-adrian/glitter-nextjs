CREATE TYPE "public"."notification_delivery_lane" AS ENUM('transactional', 'bulk');--> statement-breakpoint
ALTER TYPE "public"."email_topic" ADD VALUE 'announcements';--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "edited_at" timestamp;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "retracted_at" timestamp;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "lane" "notification_delivery_lane" DEFAULT 'transactional' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "batch_key" text;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "maybe_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "content_revision" integer;--> statement-breakpoint
CREATE INDEX "notification_deliveries_bulk_due_idx" ON "notification_deliveries" USING btree ("next_attempt_at","id") WHERE "notification_deliveries"."lane" = 'bulk' AND "notification_deliveries"."status" IN ('pending', 'processing');--> statement-breakpoint
CREATE INDEX "notification_deliveries_batch_key_idx" ON "notification_deliveries" USING btree ("batch_key") WHERE "notification_deliveries"."batch_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_batch_is_bulk_email" CHECK ("notification_deliveries"."batch_key" IS NULL OR ("notification_deliveries"."lane" = 'bulk' AND "notification_deliveries"."channel" = 'email'));--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_maybe_sent_has_batch" CHECK ("notification_deliveries"."maybe_sent_at" IS NULL OR "notification_deliveries"."batch_key" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_revision_is_bulk" CHECK ("notification_deliveries"."content_revision" IS NULL OR "notification_deliveries"."lane" = 'bulk');--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_retracted_is_archived" CHECK ("notifications"."retracted_at" IS NULL OR "notifications"."archived_at" IS NOT NULL);