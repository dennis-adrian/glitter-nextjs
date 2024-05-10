DO $$ BEGIN
 ALTER TABLE "participations" ADD CONSTRAINT "participations_reservation_id_stand_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "stand_reservations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
