ALTER TABLE "profile_tasks" DROP CONSTRAINT "profile_tasks_profile_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_requests" DROP CONSTRAINT "user_requests_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_socials" DROP CONSTRAINT "user_socials_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "profile_tasks" ALTER COLUMN "profile_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_tasks" ADD CONSTRAINT "profile_tasks_profile_id_users_id_fk" FOREIGN KEY ("profile_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "participations" ADD CONSTRAINT "participations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_requests" ADD CONSTRAINT "user_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_socials" ADD CONSTRAINT "user_socials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
