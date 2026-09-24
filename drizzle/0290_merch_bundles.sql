CREATE TABLE "cart_bundle_selections" (
	"cart_bundle_id" integer NOT NULL,
	"component_id" integer NOT NULL,
	"product_variant_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_bundles" (
	"id" serial PRIMARY KEY NOT NULL,
	"cart_id" integer NOT NULL,
	"bundle_id" integer NOT NULL,
	"bundle_version" integer NOT NULL,
	"selection_key" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cart_bundles_quantity_positive" CHECK ("cart_bundles"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "merch_bundle_collections" (
	"bundle_id" integer NOT NULL,
	"collection_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merch_bundle_component_variants" (
	"component_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"variant_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merch_bundle_components" (
	"id" serial PRIMARY KEY NOT NULL,
	"bundle_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "merch_bundle_components_id_product_unique" UNIQUE("id","product_id"),
	CONSTRAINT "merch_bundle_components_quantity_positive" CHECK ("merch_bundle_components"."quantity" > 0 AND "merch_bundle_components"."quantity" <= 99)
);
--> statement-breakpoint
CREATE TABLE "merch_bundles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"image_url" text,
	"price" numeric(10, 2) NOT NULL,
	"is_visible" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "merch_bundles_slug_unique" UNIQUE("slug"),
	CONSTRAINT "merch_bundles_price_positive" CHECK ("merch_bundles"."price" > 0),
	CONSTRAINT "merch_bundles_version_positive" CHECK ("merch_bundles"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "order_bundle_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_bundle_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"order_item_id" integer NOT NULL,
	"units_per_bundle" integer NOT NULL,
	"list_unit_price_cents" integer NOT NULL,
	"paid_unit_price_cents" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "order_bundle_items_order_item_id_unique" UNIQUE("order_item_id"),
	CONSTRAINT "order_bundle_items_units_positive" CHECK ("order_bundle_items"."units_per_bundle" > 0),
	CONSTRAINT "order_bundle_items_paid_within_list" CHECK ("order_bundle_items"."paid_unit_price_cents" >= 0 AND "order_bundle_items"."paid_unit_price_cents" <= "order_bundle_items"."list_unit_price_cents")
);
--> statement-breakpoint
CREATE TABLE "order_bundles" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"bundle_id" integer,
	"bundle_version" integer NOT NULL,
	"name_snapshot" text NOT NULL,
	"slug_snapshot" text NOT NULL,
	"image_url_snapshot" text,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"separate_unit_price_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "order_bundles_id_order_id_unique" UNIQUE("id","order_id"),
	CONSTRAINT "order_bundles_quantity_positive" CHECK ("order_bundles"."quantity" > 0),
	CONSTRAINT "order_bundles_price_discounted" CHECK ("order_bundles"."unit_price_cents" > 0 AND "order_bundles"."unit_price_cents" < "order_bundles"."separate_unit_price_cents"),
	CONSTRAINT "order_bundles_total_matches" CHECK ("order_bundles"."total_cents" = "order_bundles"."unit_price_cents" * "order_bundles"."quantity")
);
--> statement-breakpoint
ALTER TABLE "cart_bundle_selections" ADD CONSTRAINT "cart_bundle_selections_cart_bundle_id_cart_bundles_id_fk" FOREIGN KEY ("cart_bundle_id") REFERENCES "public"."cart_bundles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_bundle_selections" ADD CONSTRAINT "cart_bundle_selections_component_id_merch_bundle_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."merch_bundle_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_bundle_selections" ADD CONSTRAINT "cart_bundle_selections_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_bundles" ADD CONSTRAINT "cart_bundles_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_bundles" ADD CONSTRAINT "cart_bundles_bundle_id_merch_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."merch_bundles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_bundle_collections" ADD CONSTRAINT "merch_bundle_collections_bundle_id_merch_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."merch_bundles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_bundle_collections" ADD CONSTRAINT "merch_bundle_collections_collection_id_merch_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."merch_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_bundle_component_variants" ADD CONSTRAINT "merch_bundle_component_variants_component_fk" FOREIGN KEY ("component_id","product_id") REFERENCES "public"."merch_bundle_components"("id","product_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_bundle_component_variants" ADD CONSTRAINT "merch_bundle_component_variants_variant_fk" FOREIGN KEY ("variant_id","product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_bundle_components" ADD CONSTRAINT "merch_bundle_components_bundle_id_merch_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."merch_bundles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_bundle_components" ADD CONSTRAINT "merch_bundle_components_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_bundle_items" ADD CONSTRAINT "order_bundle_items_order_bundle_fk" FOREIGN KEY ("order_bundle_id","order_id") REFERENCES "public"."order_bundles"("id","order_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_bundle_items" ADD CONSTRAINT "order_bundle_items_order_item_fk" FOREIGN KEY ("order_item_id","order_id") REFERENCES "public"."order_items"("id","order_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_bundles" ADD CONSTRAINT "order_bundles_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_bundles" ADD CONSTRAINT "order_bundles_bundle_id_merch_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."merch_bundles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cart_bundle_selections_unique" ON "cart_bundle_selections" USING btree ("cart_bundle_id","component_id");--> statement-breakpoint
CREATE INDEX "cart_bundle_selections_variant_idx" ON "cart_bundle_selections" USING btree ("product_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_bundles_cart_bundle_selection_unique" ON "cart_bundles" USING btree ("cart_id","bundle_id","selection_key");--> statement-breakpoint
CREATE INDEX "cart_bundles_bundle_idx" ON "cart_bundles" USING btree ("bundle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merch_bundle_collections_unique" ON "merch_bundle_collections" USING btree ("bundle_id","collection_id");--> statement-breakpoint
CREATE INDEX "merch_bundle_collections_collection_idx" ON "merch_bundle_collections" USING btree ("collection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merch_bundle_component_variants_unique" ON "merch_bundle_component_variants" USING btree ("component_id","variant_id");--> statement-breakpoint
CREATE INDEX "merch_bundle_component_variants_variant_idx" ON "merch_bundle_component_variants" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "merch_bundle_components_bundle_idx" ON "merch_bundle_components" USING btree ("bundle_id");--> statement-breakpoint
CREATE INDEX "merch_bundle_components_product_idx" ON "merch_bundle_components" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "order_bundle_items_order_bundle_idx" ON "order_bundle_items" USING btree ("order_bundle_id");--> statement-breakpoint
CREATE INDEX "order_bundles_order_idx" ON "order_bundles" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_bundles_bundle_idx" ON "order_bundles" USING btree ("bundle_id");