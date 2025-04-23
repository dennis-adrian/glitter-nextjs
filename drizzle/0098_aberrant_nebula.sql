CREATE TABLE IF NOT EXISTS "collaborators_attendance_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"collaborator_id" integer NOT NULL,
	"festival_date_id" integer NOT NULL,
	"arrived_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collaborators_attendance_logs" ADD CONSTRAINT "collaborators_attendance_logs_collaborator_id_collaborators_id_fk" FOREIGN KEY ("collaborator_id") REFERENCES "collaborators"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collaborators_attendance_logs" ADD CONSTRAINT "collaborators_attendance_logs_festival_date_id_festival_dates_id_fk" FOREIGN KEY ("festival_date_id") REFERENCES "festival_dates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
