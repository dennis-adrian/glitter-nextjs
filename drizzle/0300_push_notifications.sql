CREATE TYPE "public"."notification_delivery_channel" AS ENUM('email', 'push');--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"application_server_key" text NOT NULL,
	"device_label" text,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_https" CHECK ("push_subscriptions"."endpoint" LIKE 'https://%')
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ALTER COLUMN "recipient_email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "channel" "notification_delivery_channel" DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "push_subscription_id" integer;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id","last_used_at");--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_push_subscription_id_push_subscriptions_id_fk" FOREIGN KEY ("push_subscription_id") REFERENCES "public"."push_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_idx" ON "notification_deliveries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_push_subscription_idx" ON "notification_deliveries" USING btree ("push_subscription_id");--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_recipient_per_channel" CHECK (("notification_deliveries"."channel" = 'email') = ("notification_deliveries"."recipient_email" IS NOT NULL));