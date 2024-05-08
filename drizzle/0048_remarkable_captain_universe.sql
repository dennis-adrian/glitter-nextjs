ALTER TABLE "tickets" ALTER COLUMN "qr_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "visitor_id" SET NOT NULL;