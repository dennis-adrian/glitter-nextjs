CREATE TYPE "public"."order_adjustment_actor_role" AS ENUM('admin', 'customer', 'system');--> statement-breakpoint
ALTER TYPE "public"."order_event_type" ADD VALUE 'adjusted' BEFORE 'status_changed';--> statement-breakpoint
CREATE TABLE "order_adjustment_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"adjustment_id" integer NOT NULL,
	"base_order_item_id" integer,
	"product_id" integer NOT NULL,
	"product_variant_id" integer,
	"product_name_snapshot" text NOT NULL,
	"variant_label_snapshot" text,
	"transaction_type" "product_transaction_type" DEFAULT 'purchase' NOT NULL,
	"quantity_delta" integer NOT NULL,
	"unit_price_snapshot" numeric(10, 2) NOT NULL,
	"unit_cost_snapshot" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "order_adjustment_items_quantity_delta_nonzero" CHECK ("order_adjustment_items"."quantity_delta" <> 0),
	CONSTRAINT "order_adjustment_items_price_nonnegative" CHECK ("order_adjustment_items"."unit_price_snapshot" >= 0),
	CONSTRAINT "order_adjustment_items_cost_nonnegative" CHECK ("order_adjustment_items"."unit_cost_snapshot" IS NULL OR "order_adjustment_items"."unit_cost_snapshot" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"actor_user_id" integer NOT NULL,
	"actor_role" "order_adjustment_actor_role" NOT NULL,
	"reason" text NOT NULL,
	"customer_note" text,
	"previous_total" numeric(10, 2) NOT NULL,
	"total_delta" numeric(10, 2) NOT NULL,
	"new_total" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_events" ADD COLUMN "adjustment_id" integer;--> statement-breakpoint
ALTER TABLE "order_adjustment_items" ADD CONSTRAINT "order_adjustment_items_adjustment_id_order_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."order_adjustments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_adjustment_items" ADD CONSTRAINT "order_adjustment_items_base_order_item_id_order_items_id_fk" FOREIGN KEY ("base_order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_adjustment_items" ADD CONSTRAINT "order_adjustment_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_adjustment_items" ADD CONSTRAINT "order_adjustment_items_product_variant_product_fk" FOREIGN KEY ("product_variant_id","product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_adjustments" ADD CONSTRAINT "order_adjustments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_adjustments" ADD CONSTRAINT "order_adjustments_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_adjustment_items_adjustment_id_idx" ON "order_adjustment_items" USING btree ("adjustment_id");--> statement-breakpoint
CREATE INDEX "order_adjustment_items_base_order_item_id_idx" ON "order_adjustment_items" USING btree ("base_order_item_id");--> statement-breakpoint
CREATE INDEX "order_adjustment_items_product_variant_idx" ON "order_adjustment_items" USING btree ("product_id","product_variant_id");--> statement-breakpoint
CREATE INDEX "order_adjustments_order_created_at_idx" ON "order_adjustments" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_adjustments_actor_created_at_idx" ON "order_adjustments" USING btree ("actor_user_id","created_at");--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_adjustment_id_order_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."order_adjustments"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "order_events" ("order_id", "type", "revision", "payload")
SELECT
  "orders"."id",
  'created',
  "orders"."revision",
  jsonb_build_object('legacy', true)
FROM "orders"
WHERE NOT EXISTS (
  SELECT 1
  FROM "order_events"
  WHERE "order_events"."order_id" = "orders"."id"
    AND "order_events"."type" = 'created'
);
