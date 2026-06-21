ALTER TABLE "product_variant_option_values" ADD COLUMN "product_id" integer;--> statement-breakpoint
UPDATE "product_variant_option_values" AS "selection"
SET "product_id" = "variant"."product_id"
FROM "product_variants" AS "variant"
WHERE "selection"."variant_id" = "variant"."id";--> statement-breakpoint
ALTER TABLE "product_variant_option_values" ALTER COLUMN "product_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_options_id_product_id_unique" ON "product_options" USING btree ("id","product_id");--> statement-breakpoint
CREATE INDEX "product_variant_option_values_product_id_idx" ON "product_variant_option_values" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "product_variant_option_values" ADD CONSTRAINT "product_variant_option_values_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_option_values" ADD CONSTRAINT "product_variant_option_values_variant_product_fk" FOREIGN KEY ("variant_id","product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_option_values" ADD CONSTRAINT "product_variant_option_values_option_product_fk" FOREIGN KEY ("option_id","product_id") REFERENCES "public"."product_options"("id","product_id") ON DELETE cascade ON UPDATE no action;
