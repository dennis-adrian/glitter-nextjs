CREATE TYPE "public"."map_element_type" AS ENUM('entrance', 'stage', 'door', 'bathroom', 'label', 'custom');--> statement-breakpoint
CREATE TABLE "map_elements" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "map_element_type" NOT NULL,
	"label" text,
	"position_left" real DEFAULT 0 NOT NULL,
	"position_top" real DEFAULT 0 NOT NULL,
	"width" real DEFAULT 8 NOT NULL,
	"height" real DEFAULT 8 NOT NULL,
	"rotation" real DEFAULT 0 NOT NULL,
	"festival_sector_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "map_elements" ADD CONSTRAINT "map_elements_festival_sector_id_festival_sectors_id_fk" FOREIGN KEY ("festival_sector_id") REFERENCES "public"."festival_sectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "map_elements_sector_idx" ON "map_elements" USING btree ("festival_sector_id");