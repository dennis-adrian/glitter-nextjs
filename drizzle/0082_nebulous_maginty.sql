ALTER TABLE "scheduled_tasks" DROP CONSTRAINT "scheduled_tasks_profile_id_users_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_profile_id_users_id_fk" FOREIGN KEY ("profile_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
