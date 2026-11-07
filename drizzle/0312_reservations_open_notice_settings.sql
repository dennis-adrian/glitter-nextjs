-- Per-festival settings for the "reservations are open" notice: whether it
-- goes out on its own (on by default, for existing festivals too) and through
-- which channels. A push opens its inbox item, so it needs in-app. Each send
-- records the channels it used.
ALTER TABLE "festival_reservations_open_notices" ADD COLUMN "email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "festival_reservations_open_notices" ADD COLUMN "in_app" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "festival_reservations_open_notices" ADD COLUMN "push" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN "reservations_open_notice_auto" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN "reservations_open_notice_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN "reservations_open_notice_in_app" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN "reservations_open_notice_push" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "festivals" ADD CONSTRAINT "festivals_reservations_open_notice_channels" CHECK (("festivals"."reservations_open_notice_email" OR "festivals"."reservations_open_notice_in_app") AND (NOT "festivals"."reservations_open_notice_push" OR "festivals"."reservations_open_notice_in_app"));