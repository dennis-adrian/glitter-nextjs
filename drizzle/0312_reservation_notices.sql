-- Festival reservation notices:
-- - "Reservations are open": per-festival settings (automatic send, on by
--   default for existing festivals too, and its channels; a push opens its
--   inbox item, so it needs in-app) and one row per send.
-- - "Stands still available" reminders: one row per manual send.
-- Each send is its own notification campaign. The new campaign type labels
-- are only written by the app, never by a statement here (see
-- drizzle/enum-labels.test.ts).
CREATE TYPE "public"."reservations_open_notice_trigger" AS ENUM('automatic', 'manual');--> statement-breakpoint
CREATE TYPE "public"."stands_available_audience" AS ENUM('terms_accepted', 'all_eligible');--> statement-breakpoint
ALTER TYPE "public"."notification_campaign_type" ADD VALUE 'reservations_open';--> statement-breakpoint
ALTER TYPE "public"."notification_campaign_type" ADD VALUE 'stands_available';--> statement-breakpoint
CREATE TABLE "festival_reservations_open_notices" (
	"campaign_id" integer PRIMARY KEY NOT NULL,
	"festival_id" integer NOT NULL,
	"trigger" "reservations_open_notice_trigger" NOT NULL,
	"reservations_start_date" timestamp NOT NULL,
	"env" text NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"push" boolean DEFAULT true NOT NULL,
	"recipients" integer DEFAULT 0 NOT NULL,
	"emails" integer DEFAULT 0 NOT NULL,
	"pushes" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festival_stands_available_reminders" (
	"campaign_id" integer PRIMARY KEY NOT NULL,
	"festival_id" integer NOT NULL,
	"audience" "stands_available_audience" NOT NULL,
	"env" text NOT NULL,
	"email" boolean NOT NULL,
	"in_app" boolean NOT NULL,
	"push" boolean NOT NULL,
	"recipients" integer DEFAULT 0 NOT NULL,
	"emails" integer DEFAULT 0 NOT NULL,
	"pushes" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN "reservations_open_notice_auto" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN "reservations_open_notice_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN "reservations_open_notice_in_app" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN "reservations_open_notice_push" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "festival_reservations_open_notices" ADD CONSTRAINT "festival_reservations_open_notices_campaign_id_notification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."notification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_reservations_open_notices" ADD CONSTRAINT "festival_reservations_open_notices_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_reservations_open_notices" ADD CONSTRAINT "festival_reservations_open_notices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_stands_available_reminders" ADD CONSTRAINT "festival_stands_available_reminders_campaign_id_notification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."notification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_stands_available_reminders" ADD CONSTRAINT "festival_stands_available_reminders_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_stands_available_reminders" ADD CONSTRAINT "festival_stands_available_reminders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "festival_reservations_open_notices_automatic_unique" ON "festival_reservations_open_notices" USING btree ("festival_id","reservations_start_date") WHERE "festival_reservations_open_notices"."trigger" = 'automatic';--> statement-breakpoint
CREATE INDEX "festival_reservations_open_notices_festival_idx" ON "festival_reservations_open_notices" USING btree ("festival_id","created_at");--> statement-breakpoint
CREATE INDEX "festival_stands_available_reminders_festival_idx" ON "festival_stands_available_reminders" USING btree ("festival_id","created_at");--> statement-breakpoint
ALTER TABLE "festivals" ADD CONSTRAINT "festivals_reservations_open_notice_channels" CHECK (("festivals"."reservations_open_notice_email" OR "festivals"."reservations_open_notice_in_app") AND (NOT "festivals"."reservations_open_notice_push" OR "festivals"."reservations_open_notice_in_app"));