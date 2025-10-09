CREATE TYPE "public"."discount_unit" AS ENUM('percentage', 'amount');--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "discount" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "discount_unit" "discount_unit" DEFAULT 'percentage' NOT NULL;