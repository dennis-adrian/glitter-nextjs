ALTER TABLE "orders" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "guest_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "guest_email" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "guest_phone" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "guest_order_token" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_guest_order_token_unique" UNIQUE("guest_order_token");