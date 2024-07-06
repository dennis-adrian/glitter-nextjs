ALTER TABLE "scheduled_tasks" ADD COLUMN "reservation_id" integer;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "ran_after_due_date" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_reservation_id_stand_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "stand_reservations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_profile_id_users_id_fk" FOREIGN KEY ("profile_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
