CREATE TYPE "public"."product_status" AS ENUM('available', 'presale', 'sale');--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "status" "product_status" DEFAULT 'available' NOT NULL;