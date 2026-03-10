ALTER TYPE "public"."order_status" ADD VALUE 'payment_verification' BEFORE 'processing';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_due_date" timestamp DEFAULT now() + interval '10 days' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_reminder1_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_reminder2_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_reminder3_sent_at" timestamp;