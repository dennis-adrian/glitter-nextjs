ALTER TYPE "public"."order_event_type" ADD VALUE 'category_corrected';--> statement-breakpoint
ALTER TABLE "order_adjustment_items" ADD COLUMN "store_category_snapshot" "product_store_category" DEFAULT 'merch' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "store_category_at_purchase" "product_store_category" DEFAULT 'merch' NOT NULL;--> statement-breakpoint
CREATE INDEX "order_adjustment_items_store_category_adjustment_id_idx" ON "order_adjustment_items" USING btree ("store_category_snapshot","adjustment_id");--> statement-breakpoint
CREATE INDEX "order_items_store_category_order_id_idx" ON "order_items" USING btree ("store_category_at_purchase","order_id");