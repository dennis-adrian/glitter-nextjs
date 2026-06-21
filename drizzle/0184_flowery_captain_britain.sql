CREATE TYPE "public"."product_content_section_display_context" AS ENUM('all', 'purchase', 'rental');--> statement-breakpoint
CREATE TYPE "public"."product_content_section_format" AS ENUM('free_text', 'bullet_list');--> statement-breakpoint
CREATE TYPE "public"."product_rental_stock_mode" AS ENUM('shared', 'separate');--> statement-breakpoint
CREATE TYPE "public"."product_transaction_type" AS ENUM('purchase', 'rental');--> statement-breakpoint
CREATE TYPE "public"."rental_return_condition" AS ENUM('good', 'damaged', 'missing_parts', 'lost', 'other');--> statement-breakpoint
CREATE TABLE "product_content_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"product_variant_id" integer,
	"title" text NOT NULL,
	"format" "product_content_section_format" NOT NULL,
	"body" text,
	"items" jsonb,
	"display_context" "product_content_section_display_context" DEFAULT 'all' NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_return_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"product_variant_id" integer,
	"quantity_returned" integer NOT NULL,
	"condition_status" "rental_return_condition" NOT NULL,
	"notes" text,
	"stock_restored" integer NOT NULL,
	"stock_pool" "product_rental_stock_mode" NOT NULL,
	"processed_by_user_id" integer NOT NULL,
	"previous_returned_quantity" integer,
	"new_returned_quantity" integer,
	"product_name_snapshot" text,
	"variant_label_snapshot" text,
	"customer_name_snapshot" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rental_return_logs_quantity_positive" CHECK ("rental_return_logs"."quantity_returned" > 0),
	CONSTRAINT "rental_return_logs_stock_restored_non_negative" CHECK ("rental_return_logs"."stock_restored" >= 0)
);
--> statement-breakpoint
DROP INDEX "cart_items_cart_product_base_unique";--> statement-breakpoint
DROP INDEX "cart_items_cart_product_variant_unique";--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN "transaction_type" "product_transaction_type" DEFAULT 'purchase' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "transaction_type" "product_transaction_type" DEFAULT 'purchase' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "rental_content_sections_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "rental_stock_mode_snapshot" "product_rental_stock_mode";--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "rental_festival_id" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "rental_reservation_id" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "rental_returned_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "rental_stock" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_purchasable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_rentable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "rental_price" real;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "rental_stock_mode" "product_rental_stock_mode" DEFAULT 'shared' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "rental_stock" integer;--> statement-breakpoint
ALTER TABLE "product_content_sections" ADD CONSTRAINT "product_content_sections_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_content_sections" ADD CONSTRAINT "product_content_sections_product_variant_product_fk" FOREIGN KEY ("product_variant_id","product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_return_logs" ADD CONSTRAINT "rental_return_logs_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_return_logs" ADD CONSTRAINT "rental_return_logs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_return_logs" ADD CONSTRAINT "rental_return_logs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_return_logs" ADD CONSTRAINT "rental_return_logs_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_return_logs" ADD CONSTRAINT "rental_return_logs_processed_by_user_id_users_id_fk" FOREIGN KEY ("processed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_content_sections_product_id_idx" ON "product_content_sections" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_content_sections_variant_id_idx" ON "product_content_sections" USING btree ("product_variant_id");--> statement-breakpoint
CREATE INDEX "product_content_sections_product_sort_idx" ON "product_content_sections" USING btree ("product_id","product_variant_id","sort_order");--> statement-breakpoint
CREATE INDEX "rental_return_logs_order_item_id_idx" ON "rental_return_logs" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "rental_return_logs_order_id_idx" ON "rental_return_logs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "rental_return_logs_product_id_idx" ON "rental_return_logs" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "rental_return_logs_created_at_idx" ON "rental_return_logs" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_rental_festival_id_festivals_id_fk" FOREIGN KEY ("rental_festival_id") REFERENCES "public"."festivals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_rental_reservation_id_stand_reservations_id_fk" FOREIGN KEY ("rental_reservation_id") REFERENCES "public"."stand_reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_cart_product_base_unique" ON "cart_items" USING btree ("cart_id","product_id","transaction_type") WHERE "cart_items"."product_variant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_cart_product_variant_unique" ON "cart_items" USING btree ("cart_id","product_id","product_variant_id","transaction_type") WHERE "cart_items"."product_variant_id" IS NOT NULL;