-- Festival reservation notices:
-- - "Reservations are open": per-festival settings (automatic send, on by
--   default for existing festivals too, and its channels; a push opens its
--   inbox item, so it needs in-app) and one row per send.
-- - "Stands still available" reminders: one row per manual send.
-- Each send is its own notification campaign. The new campaign type labels
-- are only written by the app, never by a statement here (see
-- drizzle/enum-labels.test.ts).
--
-- This branch first pushed these objects as 0311-0313, before develop took
-- 0311, and preview databases may have run them under those names; they never
-- re-run a recorded migration, but they do run this one. Idempotent, so it
-- changes nothing where the objects are already there, and touches only its
-- own objects.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE t.typname = 'reservations_open_notice_trigger' AND n.nspname = 'public'
	) THEN
		CREATE TYPE "public"."reservations_open_notice_trigger" AS ENUM('automatic', 'manual');
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE t.typname = 'stands_available_audience' AND n.nspname = 'public'
	) THEN
		CREATE TYPE "public"."stands_available_audience" AS ENUM('terms_accepted', 'all_eligible');
	END IF;
END $$;--> statement-breakpoint
ALTER TYPE "public"."notification_campaign_type" ADD VALUE IF NOT EXISTS 'reservations_open';--> statement-breakpoint
ALTER TYPE "public"."notification_campaign_type" ADD VALUE IF NOT EXISTS 'stands_available';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "festival_reservations_open_notices" (
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
);--> statement-breakpoint
-- A database that ran only the first push of this migration has the table
-- without its channels.
ALTER TABLE "festival_reservations_open_notices" ADD COLUMN IF NOT EXISTS "email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "festival_reservations_open_notices" ADD COLUMN IF NOT EXISTS "in_app" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "festival_reservations_open_notices" ADD COLUMN IF NOT EXISTS "push" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "festival_stands_available_reminders" (
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
);--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN IF NOT EXISTS "reservations_open_notice_auto" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN IF NOT EXISTS "reservations_open_notice_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN IF NOT EXISTS "reservations_open_notice_in_app" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN IF NOT EXISTS "reservations_open_notice_push" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('festival_reservations_open_notices_campaign_id_notification_campaigns_id_fk', 63)) THEN
		ALTER TABLE "festival_reservations_open_notices" ADD CONSTRAINT "festival_reservations_open_notices_campaign_id_notification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."notification_campaigns"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('festival_reservations_open_notices_festival_id_festivals_id_fk', 63)) THEN
		ALTER TABLE "festival_reservations_open_notices" ADD CONSTRAINT "festival_reservations_open_notices_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('festival_reservations_open_notices_created_by_user_id_users_id_fk', 63)) THEN
		ALTER TABLE "festival_reservations_open_notices" ADD CONSTRAINT "festival_reservations_open_notices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('festival_stands_available_reminders_campaign_id_notification_campaigns_id_fk', 63)) THEN
		ALTER TABLE "festival_stands_available_reminders" ADD CONSTRAINT "festival_stands_available_reminders_campaign_id_notification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."notification_campaigns"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('festival_stands_available_reminders_festival_id_festivals_id_fk', 63)) THEN
		ALTER TABLE "festival_stands_available_reminders" ADD CONSTRAINT "festival_stands_available_reminders_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('festival_stands_available_reminders_created_by_user_id_users_id_fk', 63)) THEN
		ALTER TABLE "festival_stands_available_reminders" ADD CONSTRAINT "festival_stands_available_reminders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "festival_reservations_open_notices_automatic_unique" ON "festival_reservations_open_notices" USING btree ("festival_id","reservations_start_date") WHERE "festival_reservations_open_notices"."trigger" = 'automatic';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "festival_reservations_open_notices_festival_idx" ON "festival_reservations_open_notices" USING btree ("festival_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "festival_stands_available_reminders_festival_idx" ON "festival_stands_available_reminders" USING btree ("festival_id","created_at");--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('festivals_reservations_open_notice_channels', 63)) THEN
		ALTER TABLE "festivals" ADD CONSTRAINT "festivals_reservations_open_notice_channels" CHECK (("festivals"."reservations_open_notice_email" OR "festivals"."reservations_open_notice_in_app") AND (NOT "festivals"."reservations_open_notice_push" OR "festivals"."reservations_open_notice_in_app"));
	END IF;
END $$;
