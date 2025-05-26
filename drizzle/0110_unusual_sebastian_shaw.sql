CREATE INDEX IF NOT EXISTS "order_items_order_id_idx" ON "order_items" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_items_product_id_idx" ON "order_items" ("product_id");