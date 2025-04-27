ALTER TABLE "festival_dates" DROP CONSTRAINT "festival_dates_festival_id_festivals_id_fk";
--> statement-breakpoint
ALTER TABLE "festival_sectors" DROP CONSTRAINT "festival_sectors_festival_id_festivals_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "festival_dates" ADD CONSTRAINT "festival_dates_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "festivals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "festival_sectors" ADD CONSTRAINT "festival_sectors_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "festivals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
