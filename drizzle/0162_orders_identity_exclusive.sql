ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_identity_check";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_identity_check" CHECK ((
				("orders"."user_id" IS NOT NULL AND "orders"."guest_name" IS NULL AND "orders"."guest_email" IS NULL AND "orders"."guest_phone" IS NULL AND "orders"."guest_order_token" IS NULL)
				OR
				("orders"."user_id" IS NULL AND "orders"."guest_name" IS NOT NULL AND "orders"."guest_email" IS NOT NULL AND "orders"."guest_phone" IS NOT NULL AND "orders"."guest_order_token" IS NOT NULL)
			));