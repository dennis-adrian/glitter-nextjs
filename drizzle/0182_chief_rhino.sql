UPDATE "products" SET "status" = 'presale' WHERE "is_pre_order" = true;--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "is_pre_order";
