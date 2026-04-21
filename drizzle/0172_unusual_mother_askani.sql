ALTER TABLE "stand_reservations" DROP CONSTRAINT IF EXISTS "stand_reservations_stand_id_stands_id_fk";
--> statement-breakpoint
ALTER TABLE "stand_reservations" ADD CONSTRAINT "stand_reservations_stand_id_stands_id_fk" FOREIGN KEY ("stand_id") REFERENCES "public"."stands"("id") ON DELETE no action ON UPDATE no action;