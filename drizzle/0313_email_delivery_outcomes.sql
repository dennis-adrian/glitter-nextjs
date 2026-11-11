CREATE TYPE "public"."email_delivery_outcome" AS ENUM('delivery_delayed', 'delivered', 'bounced', 'failed', 'suppressed', 'complained');--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "delivery_outcome" "email_delivery_outcome";--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "delivery_outcome_at" timestamp;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "bounce_type" text;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "delivery_detail" text;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "opened_at" timestamp;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "clicked_at" timestamp;--> statement-breakpoint
CREATE INDEX "notification_deliveries_provider_message_idx" ON "notification_deliveries" USING btree ("provider_message_id") WHERE "notification_deliveries"."provider_message_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_outcome_is_email" CHECK ("notification_deliveries"."delivery_outcome" IS NULL OR "notification_deliveries"."channel" = 'email');