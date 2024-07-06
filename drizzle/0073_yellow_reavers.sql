DO $$ BEGIN
 CREATE TYPE "scheduled_task_type" AS ENUM('profile_creation', 'stand_reservation');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "task_type" "scheduled_task_type" DEFAULT 'profile_creation' NOT NULL;