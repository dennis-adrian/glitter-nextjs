CREATE TYPE "public"."credit_gift_occasion" AS ENUM('thanks', 'compensation', 'prize', 'welcome', 'other');--> statement-breakpoint
CREATE TYPE "public"."notification_campaign_recipient_status" AS ENUM('pending', 'granted', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_campaign_status" AS ENUM('processing', 'completed');--> statement-breakpoint
CREATE TYPE "public"."notification_campaign_type" AS ENUM('credit_gift');--> statement-breakpoint
CREATE TYPE "public"."notification_category" AS ENUM('reservations', 'credits', 'announcements', 'account', 'admin');--> statement-breakpoint
CREATE TYPE "public"."notification_delivery_status" AS ENUM('pending', 'processing', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "credit_gift_details" (
	"campaign_id" integer PRIMARY KEY NOT NULL,
	"amount_per_recipient" numeric(12, 2) NOT NULL,
	"occasion" "credit_gift_occasion" NOT NULL,
	"internal_note" text NOT NULL,
	CONSTRAINT "credit_gift_details_amount_positive" CHECK ("credit_gift_details"."amount_per_recipient" > 0)
);
--> statement-breakpoint
CREATE TABLE "notification_campaign_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"status" "notification_campaign_recipient_status" DEFAULT 'pending' NOT NULL,
	"skipped_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"ledger_entry_id" integer,
	"notification_id" integer,
	"reversal_entry_id" integer,
	"revoked_at" timestamp,
	"revoked_by_user_id" integer,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_campaign_recipients_skip_reason" CHECK (("notification_campaign_recipients"."status" = 'skipped') = ("notification_campaign_recipients"."skipped_reason" IS NOT NULL)),
	CONSTRAINT "notification_campaign_recipients_revoked_was_granted" CHECK ("notification_campaign_recipients"."revoked_at" IS NULL OR ("notification_campaign_recipients"."status" = 'granted' AND "notification_campaign_recipients"."reversal_entry_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "notification_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "notification_campaign_type" NOT NULL,
	"status" "notification_campaign_status" DEFAULT 'processing' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"created_by_user_id" integer,
	"idempotency_key" text NOT NULL,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"notification_id" integer,
	"user_id" integer,
	"template_key" text NOT NULL,
	"recipient_email" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp,
	"last_error" text,
	"provider_message_id" text,
	"idempotency_key" text NOT NULL,
	"resend_of_delivery_id" integer,
	"requested_by_user_id" integer,
	"sent_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"category" "notification_category" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"action_path" text,
	"action_label" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"campaign_id" integer,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp,
	"archived_at" timestamp,
	"celebrated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_action_path_relative" CHECK ("notifications"."action_path" IS NULL OR "notifications"."action_path" LIKE '/%')
);
--> statement-breakpoint
ALTER TABLE "credit_gift_details" ADD CONSTRAINT "credit_gift_details_campaign_id_notification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."notification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_campaign_recipients" ADD CONSTRAINT "notification_campaign_recipients_campaign_id_notification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."notification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_campaign_recipients" ADD CONSTRAINT "notification_campaign_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_campaign_recipients" ADD CONSTRAINT "notification_campaign_recipients_ledger_entry_id_credit_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."credit_ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_campaign_recipients" ADD CONSTRAINT "notification_campaign_recipients_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_campaign_recipients" ADD CONSTRAINT "notification_campaign_recipients_reversal_entry_id_credit_ledger_entries_id_fk" FOREIGN KEY ("reversal_entry_id") REFERENCES "public"."credit_ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_campaign_recipients" ADD CONSTRAINT "notification_campaign_recipients_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_campaigns" ADD CONSTRAINT "notification_campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_resend_of_delivery_id_fk" FOREIGN KEY ("resend_of_delivery_id") REFERENCES "public"."notification_deliveries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_campaign_id_notification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."notification_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_campaign_recipients_campaign_user_unique" ON "notification_campaign_recipients" USING btree ("campaign_id","user_id");--> statement-breakpoint
CREATE INDEX "notification_campaign_recipients_pending_idx" ON "notification_campaign_recipients" USING btree ("campaign_id") WHERE "notification_campaign_recipients"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "notification_campaign_recipients_ledger_entry_idx" ON "notification_campaign_recipients" USING btree ("ledger_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_campaigns_idempotency_key_unique" ON "notification_campaigns" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "notification_campaigns_type_created_idx" ON "notification_campaigns" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "notification_campaigns_processing_idx" ON "notification_campaigns" USING btree ("created_at") WHERE "notification_campaigns"."status" = 'processing';--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_idempotency_key_unique" ON "notification_deliveries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_next_attempt_idx" ON "notification_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_notification_idx" ON "notification_deliveries" USING btree ("notification_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_key_unique" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","created_at") WHERE "notifications"."read_at" IS NULL AND "notifications"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "notifications_campaign_idx" ON "notifications" USING btree ("campaign_id");