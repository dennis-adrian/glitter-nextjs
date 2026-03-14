CREATE TYPE "public"."product_image_upload_status" AS ENUM('pending', 'active');--> statement-breakpoint
ALTER TABLE "product_images" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "upload_status" "product_image_upload_status" DEFAULT 'pending' NOT NULL;