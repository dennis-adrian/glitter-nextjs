-- Comunicados to visitors and guest merch buyers (docs/IMPLEMENTATION-comunicados.md
-- §L). Tables are locked up front, in the order the app takes them: a send
-- locks its comunicado and then writes notification_campaigns, and every
-- delivery row is written after its campaign exists. visitors and orders are
-- never written in a transaction that touches the comunicado tables.
-- scripts/migrate.ts's lock_timeout turns a wait behind a bulk batch (which
-- holds ACCESS SHARE across a Resend call) into a failed build that a
-- redeploy retries. 'news' is only used by runtime code (A0).
LOCK TABLE "comunicados" IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
LOCK TABLE "notification_campaigns" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
LOCK TABLE "notification_deliveries" IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
LOCK TABLE "visitors" IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
LOCK TABLE "orders" IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
CREATE TYPE "public"."campaign_contact_source" AS ENUM('visitor', 'guest_buyer', 'staging_admin');--> statement-breakpoint
CREATE TYPE "public"."campaign_contact_status" AS ENUM('queued', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."comunicado_audience_kind" AS ENUM('users', 'visitors');--> statement-breakpoint
ALTER TYPE "public"."email_topic" ADD VALUE 'news';--> statement-breakpoint
CREATE TABLE "notification_campaign_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"email_key" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"visitor_id" integer,
	"source" "campaign_contact_source" NOT NULL,
	"status" "campaign_contact_status" NOT NULL,
	"skipped_reason" text,
	"delivery_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_campaign_contacts_skip_reason" CHECK (("notification_campaign_contacts"."status" = 'skipped') = ("notification_campaign_contacts"."skipped_reason" IS NOT NULL)),
	CONSTRAINT "notification_campaign_contacts_email_key_normalized" CHECK ("notification_campaign_contacts"."email_key" = lower(trim("notification_campaign_contacts"."email_key")) and "notification_campaign_contacts"."email_key" <> '')
);
--> statement-breakpoint
ALTER TABLE "comunicados" ADD COLUMN "audience_kind" "comunicado_audience_kind" DEFAULT 'users' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "campaign_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "guest_news_opt_in" boolean;--> statement-breakpoint
ALTER TABLE "visitors" ADD COLUMN "news_opt_in" boolean;--> statement-breakpoint
ALTER TABLE "visitors" ADD COLUMN "news_opt_in_at" timestamp;--> statement-breakpoint
ALTER TABLE "notification_campaign_contacts" ADD CONSTRAINT "notification_campaign_contacts_campaign_id_notification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."notification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_campaign_contacts" ADD CONSTRAINT "notification_campaign_contacts_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_campaign_contacts" ADD CONSTRAINT "notification_campaign_contacts_delivery_id_notification_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."notification_deliveries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_campaign_contacts_campaign_email_unique" ON "notification_campaign_contacts" USING btree ("campaign_id","email_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_campaign_contacts_delivery_unique" ON "notification_campaign_contacts" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "notification_campaign_contacts_visitor_idx" ON "notification_campaign_contacts" USING btree ("visitor_id");--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_campaign_id_notification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."notification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_campaign_idx" ON "notification_deliveries" USING btree ("campaign_id") WHERE "notification_deliveries"."campaign_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "comunicados" ADD CONSTRAINT "comunicados_visitors_email_only" CHECK ("comunicados"."status" = 'draft' OR "comunicados"."audience_kind" = 'users' OR ("comunicados"."send_email" AND NOT "comunicados"."send_push" AND NOT "comunicados"."essential"));--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_campaign_without_inbox" CHECK ("notification_deliveries"."campaign_id" IS NULL OR ("notification_deliveries"."notification_id" IS NULL AND "notification_deliveries"."lane" = 'bulk' AND "notification_deliveries"."channel" = 'email'));