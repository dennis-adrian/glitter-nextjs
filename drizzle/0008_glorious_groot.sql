ALTER TABLE "user_requests" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "user_requests" ALTER COLUMN "status" SET NOT NULL;