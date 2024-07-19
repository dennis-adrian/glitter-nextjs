ALTER TABLE "scheduled_tasks" ALTER COLUMN "profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "number_of_visitors" integer DEFAULT 1 NOT NULL;