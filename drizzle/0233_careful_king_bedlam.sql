CREATE TYPE "public"."order_return_status" AS ENUM('received', 'refunded', 'rejected');--> statement-breakpoint
CREATE TABLE "order_return_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"return_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"order_item_id" integer,
	"product_id" integer NOT NULL,
	"product_variant_id" integer,
	"product_name_snapshot" text NOT NULL,
	"variant_label_snapshot" text,
	"quantity" integer NOT NULL,
	"unit_price_snapshot" numeric(10, 2) NOT NULL,
	"unit_cost_snapshot" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "order_return_items_quantity_positive" CHECK ("order_return_items"."quantity" > 0),
	CONSTRAINT "order_return_items_price_nonnegative" CHECK ("order_return_items"."unit_price_snapshot" >= 0),
	CONSTRAINT "order_return_items_cost_nonnegative" CHECK ("order_return_items"."unit_cost_snapshot" IS NULL OR "order_return_items"."unit_cost_snapshot" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"adjustment_id" integer NOT NULL,
	"actor_user_id" integer NOT NULL,
	"status" "order_return_status" DEFAULT 'received' NOT NULL,
	"reason" text NOT NULL,
	"refund_amount" numeric(10, 2) NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"refunded_at" timestamp,
	"refund_reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "order_returns_refund_amount_nonnegative" CHECK ("order_returns"."refund_amount" >= 0),
	CONSTRAINT "order_returns_refunded_at_required" CHECK (("order_returns"."status" = 'refunded' AND "order_returns"."refunded_at" IS NOT NULL) OR ("order_returns"."status" <> 'refunded' AND "order_returns"."refunded_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "order_return_items" ADD CONSTRAINT "order_return_items_return_id_order_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."order_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return_items" ADD CONSTRAINT "order_return_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return_items" ADD CONSTRAINT "order_return_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return_items" ADD CONSTRAINT "order_return_items_product_variant_product_fk" FOREIGN KEY ("product_variant_id","product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_adjustment_id_order_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."order_adjustments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_id_order_id_unique" UNIQUE("id","order_id");--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_id_order_id_unique" UNIQUE("id","order_id");--> statement-breakpoint
ALTER TABLE "order_return_items" ADD CONSTRAINT "order_return_items_return_order_fk" FOREIGN KEY ("return_id","order_id") REFERENCES "public"."order_returns"("id","order_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return_items" ADD CONSTRAINT "order_return_items_order_item_order_fk" FOREIGN KEY ("order_item_id","order_id") REFERENCES "public"."order_items"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_return_items_return_id_idx" ON "order_return_items" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "order_returns_order_created_at_idx" ON "order_returns" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_returns_received_at_idx" ON "order_returns" USING btree ("received_at");
