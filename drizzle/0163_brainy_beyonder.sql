ALTER TABLE "orders" DROP CONSTRAINT "orders_identity_check";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_identity_check" CHECK ((
				("orders"."user_id" IS NOT NULL AND "orders"."guest_name" IS NULL AND "orders"."guest_email" IS NULL AND "orders"."guest_phone" IS NULL AND "orders"."guest_order_token" IS NULL)
				OR
				("orders"."user_id" IS NULL AND length(trim("orders"."guest_name")) > 0 AND length(trim("orders"."guest_email")) > 0 AND length(trim("orders"."guest_phone")) > 0 AND length(trim("orders"."guest_order_token")) > 0)
			));