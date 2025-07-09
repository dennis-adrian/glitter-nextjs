ALTER TABLE "infractions" ADD COLUMN "user_gave_notice" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "infractions" ADD COLUMN "gave_notice_at" timestamp;