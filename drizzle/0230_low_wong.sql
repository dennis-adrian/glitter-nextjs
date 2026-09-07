ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_cost_at_purchase_nonnegative" CHECK ("order_items"."unit_cost_at_purchase" IS NULL OR "order_items"."unit_cost_at_purchase" >= 0);--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_unit_cost_nonnegative" CHECK ("product_variants"."unit_cost" IS NULL OR "product_variants"."unit_cost" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_unit_cost_nonnegative" CHECK ("products"."unit_cost" IS NULL OR "products"."unit_cost" >= 0);
--> statement-breakpoint
UPDATE "order_items"
SET "product_name_at_purchase" = "products"."name"
FROM "products"
WHERE "order_items"."product_id" = "products"."id"
  AND "order_items"."product_name_at_purchase" IS NULL;
