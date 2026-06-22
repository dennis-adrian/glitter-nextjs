ALTER TABLE "order_items" DROP CONSTRAINT "order_items_rental_context_required";--> statement-breakpoint
DROP INDEX "cart_items_cart_product_base_unique";--> statement-breakpoint
DROP INDEX "cart_items_cart_product_variant_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_cart_product_base_purchase_unique" ON "cart_items" USING btree ("cart_id","product_id","transaction_type") WHERE "cart_items"."product_variant_id" IS NULL AND "cart_items"."rental_festival_id" IS NULL AND "cart_items"."rental_reservation_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_cart_product_variant_purchase_unique" ON "cart_items" USING btree ("cart_id","product_id","product_variant_id","transaction_type") WHERE "cart_items"."product_variant_id" IS NOT NULL AND "cart_items"."rental_festival_id" IS NULL AND "cart_items"."rental_reservation_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_cart_product_base_unique" ON "cart_items" USING btree ("cart_id","product_id","transaction_type","rental_festival_id","rental_reservation_id") WHERE "cart_items"."product_variant_id" IS NULL AND "cart_items"."rental_festival_id" IS NOT NULL AND "cart_items"."rental_reservation_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_cart_product_variant_unique" ON "cart_items" USING btree ("cart_id","product_id","product_variant_id","transaction_type","rental_festival_id","rental_reservation_id") WHERE "cart_items"."product_variant_id" IS NOT NULL AND "cart_items"."rental_festival_id" IS NOT NULL AND "cart_items"."rental_reservation_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_rental_context_required" CHECK ((
        "order_items"."transaction_type" != 'rental'
        AND "order_items"."rental_content_sections_snapshot" IS NULL
        AND "order_items"."rental_stock_mode_snapshot" IS NULL
        AND "order_items"."rental_festival_id" IS NULL
        AND "order_items"."rental_reservation_id" IS NULL
        AND "order_items"."rental_returned_quantity" = 0
      ) OR (
        "order_items"."transaction_type" = 'rental'
        AND "order_items"."rental_festival_id" IS NOT NULL
        AND "order_items"."rental_reservation_id" IS NOT NULL
      ));