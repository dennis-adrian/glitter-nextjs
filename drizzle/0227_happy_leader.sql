ALTER TABLE "order_items" ADD COLUMN "unit_cost_at_purchase" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "product_name_at_purchase" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "unit_cost" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "unit_cost" numeric(10, 2);