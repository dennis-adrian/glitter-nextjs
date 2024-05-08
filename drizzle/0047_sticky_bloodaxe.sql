ALTER TABLE "tickets" ALTER COLUMN "qr_code_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "visitor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "is_event_day_creation" boolean DEFAULT false NOT NULL;