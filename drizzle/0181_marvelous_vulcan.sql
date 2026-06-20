ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_product_variant_id_product_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_product_variant_id_product_variants_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "product_option_values_option_id_id_unique" ON "product_option_values" USING btree ("option_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_id_product_id_unique" ON "product_variants" USING btree ("id","product_id");--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_variant_product_fk" FOREIGN KEY ("product_variant_id","product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_variant_product_fk" FOREIGN KEY ("product_variant_id","product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_option_values" ADD CONSTRAINT "product_variant_option_values_option_value_pair_fk" FOREIGN KEY ("option_id","option_value_id") REFERENCES "public"."product_option_values"("option_id","id") ON DELETE cascade ON UPDATE no action;
