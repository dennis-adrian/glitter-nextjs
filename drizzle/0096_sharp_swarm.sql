DO $$ BEGIN
 ALTER TABLE "reservation_collaborators" ADD CONSTRAINT "reservation_collaborators_reservation_id_stand_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "stand_reservations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservation_collaborators" ADD CONSTRAINT "reservation_collaborators_collaborator_id_collaborators_id_fk" FOREIGN KEY ("collaborator_id") REFERENCES "collaborators"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
