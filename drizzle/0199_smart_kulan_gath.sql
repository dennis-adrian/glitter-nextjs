ALTER TABLE "user_status_events" DROP CONSTRAINT "user_status_events_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_status_events" ADD CONSTRAINT "user_status_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;