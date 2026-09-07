ALTER TABLE "cart_items" ADD COLUMN "rental_festival_id" integer;--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN "rental_reservation_id" integer;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_rental_festival_id_festivals_id_fk" FOREIGN KEY ("rental_festival_id") REFERENCES "public"."festivals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_rental_reservation_id_stand_reservations_id_fk" FOREIGN KEY ("rental_reservation_id") REFERENCES "public"."stand_reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cart_items_rental_festival_id_idx" ON "cart_items" USING btree ("rental_festival_id");--> statement-breakpoint
CREATE INDEX "cart_items_rental_reservation_id_idx" ON "cart_items" USING btree ("rental_reservation_id");--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_rental_context_required" CHECK ("cart_items"."transaction_type" != 'rental' OR ("cart_items"."rental_festival_id" IS NOT NULL AND "cart_items"."rental_reservation_id" IS NOT NULL));