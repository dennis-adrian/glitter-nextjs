CREATE TYPE "public"."store_section" AS ENUM('merch', 'supplies');--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "section" "store_section" NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_section_unique" UNIQUE("section");