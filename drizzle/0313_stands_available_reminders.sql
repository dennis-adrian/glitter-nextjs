-- "Stands still available" reminders an admin sends for a festival: one row
-- per send, each its own notification campaign. The new campaign type label is
-- only written by the app, never by a statement here (enum-labels.test.ts).
CREATE TYPE "public"."stands_available_audience" AS ENUM('terms_accepted', 'all_eligible');--> statement-breakpoint
ALTER TYPE "public"."notification_campaign_type" ADD VALUE 'stands_available';--> statement-breakpoint
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
ALTER TABLE "festival_stands_available_reminders" ADD CONSTRAINT "festival_stands_available_reminders_campaign_id_notification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."notification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_stands_available_reminders" ADD CONSTRAINT "festival_stands_available_reminders_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_stands_available_reminders" ADD CONSTRAINT "festival_stands_available_reminders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "festival_stands_available_reminders_festival_idx" ON "festival_stands_available_reminders" USING btree ("festival_id","created_at");