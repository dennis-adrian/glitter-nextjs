DO $$ BEGIN
 CREATE TYPE "profile_task_type" AS ENUM('profile_creation');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"due_date" timestamp NOT NULL,
	"completed_at" timestamp,
	"reminder_time" timestamp NOT NULL,
	"reminder_sent_at" timestamp,
	"profile_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_tasks" ADD CONSTRAINT "profile_tasks_profile_id_users_id_fk" FOREIGN KEY ("profile_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
