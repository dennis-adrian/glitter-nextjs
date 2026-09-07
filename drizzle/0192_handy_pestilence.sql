CREATE TABLE "coupon_book_print_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_rental_festival_id_festivals_id_fk";
--> statement-breakpoint
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_rental_reservation_id_stand_reservations_id_fk";
--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_rental_festival_id_festivals_id_fk";
--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_rental_reservation_id_stand_reservations_id_fk";
--> statement-breakpoint
ALTER TABLE "rental_return_logs" DROP CONSTRAINT "rental_return_logs_product_variant_id_product_variants_id_fk";
--> statement-breakpoint
CREATE INDEX "coupon_book_print_sessions_expires_at_idx" ON "coupon_book_print_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stand_reservations_id_festival_id_unique" ON "stand_reservations" USING btree ("id","festival_id");--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_rental_reservation_festival_fk" FOREIGN KEY ("rental_reservation_id","rental_festival_id") REFERENCES "public"."stand_reservations"("id","festival_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_rental_reservation_festival_fk" FOREIGN KEY ("rental_reservation_id","rental_festival_id") REFERENCES "public"."stand_reservations"("id","festival_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_return_logs" ADD CONSTRAINT "rental_return_logs_product_variant_product_fk" FOREIGN KEY ("product_variant_id","product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE restrict ON UPDATE no action;