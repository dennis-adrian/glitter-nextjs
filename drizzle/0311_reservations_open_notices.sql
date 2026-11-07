-- "Reservations are open" notices: one row per send, each its own
-- notification campaign. The automatic one is unique per festival and
-- opening time. The new campaign type label is only written by the app, never
-- by a statement here (see drizzle/enum-labels.test.ts).
CREATE TYPE "public"."reservations_open_notice_trigger" AS ENUM('automatic', 'manual');--> statement-breakpoint
ALTER TYPE "public"."notification_campaign_type" ADD VALUE 'reservations_open';--> statement-breakpoint
CREATE TABLE "festival_reservations_open_notices" (
	"campaign_id" integer PRIMARY KEY NOT NULL,
	"festival_id" integer NOT NULL,
	"trigger" "reservations_open_notice_trigger" NOT NULL,
	"reservations_start_date" timestamp NOT NULL,
	"env" text NOT NULL,
	"recipients" integer DEFAULT 0 NOT NULL,
	"emails" integer DEFAULT 0 NOT NULL,
	"pushes" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "festival_reservations_open_notices" ADD CONSTRAINT "festival_reservations_open_notices_campaign_id_notification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."notification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_reservations_open_notices" ADD CONSTRAINT "festival_reservations_open_notices_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_reservations_open_notices" ADD CONSTRAINT "festival_reservations_open_notices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "festival_reservations_open_notices_automatic_unique" ON "festival_reservations_open_notices" USING btree ("festival_id","reservations_start_date") WHERE "festival_reservations_open_notices"."trigger" = 'automatic';--> statement-breakpoint
CREATE INDEX "festival_reservations_open_notices_festival_idx" ON "festival_reservations_open_notices" USING btree ("festival_id","created_at");