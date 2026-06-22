ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_rental_context_required";--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_rental_context_required";--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_rental_returned_quantity_valid";--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_rental_context_required" CHECK ((
        "cart_items"."transaction_type" != 'rental'
        AND "cart_items"."rental_festival_id" IS NULL
        AND "cart_items"."rental_reservation_id" IS NULL
      ) OR (
        "cart_items"."transaction_type" = 'rental'
        AND "cart_items"."rental_festival_id" IS NOT NULL
        AND "cart_items"."rental_reservation_id" IS NOT NULL
      ));--> statement-breakpoint
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
        AND "order_items"."rental_stock_mode_snapshot" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_rental_returned_quantity_valid" CHECK ("order_items"."rental_returned_quantity" >= 0 AND "order_items"."rental_returned_quantity" <= "order_items"."quantity");