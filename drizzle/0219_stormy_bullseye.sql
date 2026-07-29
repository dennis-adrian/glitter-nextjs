ALTER TABLE "session_purchases" DROP CONSTRAINT "session_purchases_access_token_unique";--> statement-breakpoint
ALTER TABLE "session_purchases" DROP COLUMN "access_token";