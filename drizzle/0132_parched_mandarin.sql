CREATE TYPE "public"."map_element_label_position" AS ENUM('left', 'right', 'top', 'bottom');--> statement-breakpoint
ALTER TABLE "map_elements" ADD COLUMN "label_position" "map_element_label_position" DEFAULT 'bottom' NOT NULL;--> statement-breakpoint
ALTER TABLE "map_elements" ADD COLUMN "label_font_size" real DEFAULT 2 NOT NULL;