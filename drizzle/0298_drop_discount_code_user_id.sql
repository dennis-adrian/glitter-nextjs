ALTER TABLE "discount_codes" DROP CONSTRAINT "discount_codes_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "discount_codes" DROP COLUMN "user_id";