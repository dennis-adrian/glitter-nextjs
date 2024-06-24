ALTER TABLE "stands" ADD COLUMN "festival_sector_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stands" ADD CONSTRAINT "stands_festival_sector_id_festival_sectors_id_fk" FOREIGN KEY ("festival_sector_id") REFERENCES "festival_sectors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
