ALTER TABLE "festivals" ADD COLUMN "illustration_payment_qr_code_url" text;--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN "gastronomy_payment_qr_code_url" text;--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN "entrepreneurship_payment_qr_code_url" text;--> statement-breakpoint
ALTER TABLE "festival_sectors" DROP COLUMN IF EXISTS "payment_qr_code_url";