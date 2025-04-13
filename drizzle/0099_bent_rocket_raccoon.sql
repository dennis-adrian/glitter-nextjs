ALTER TABLE "collaborators_attendance_logs" RENAME COLUMN "collaborator_id" TO "reservation_collaborator_id";--> statement-breakpoint
ALTER TABLE "collaborators_attendance_logs" DROP CONSTRAINT "collaborators_attendance_logs_collaborator_id_collaborators_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collaborators_attendance_logs" ADD CONSTRAINT "collaborators_attendance_logs_reservation_collaborator_id_reservation_collaborators_id_fk" FOREIGN KEY ("reservation_collaborator_id") REFERENCES "reservation_collaborators"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
