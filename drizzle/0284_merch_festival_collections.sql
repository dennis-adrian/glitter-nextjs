CREATE TABLE "merch_collection_products" (
	"festival_id" integer NOT NULL,
	"product_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merch_collection_products" ADD CONSTRAINT "merch_collection_products_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_collection_products" ADD CONSTRAINT "merch_collection_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "merch_collection_products_unique" ON "merch_collection_products" USING btree ("festival_id","product_id");--> statement-breakpoint
CREATE INDEX "merch_collection_products_product_idx" ON "merch_collection_products" USING btree ("product_id");