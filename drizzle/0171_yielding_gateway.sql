ALTER TABLE "stands" DROP CONSTRAINT "stands_festival_sector_id_festival_sectors_id_fk";
--> statement-breakpoint
ALTER TABLE "stands" ADD CONSTRAINT "stands_festival_sector_id_festival_sectors_id_fk" FOREIGN KEY ("festival_sector_id") REFERENCES "public"."festival_sectors"("id") ON DELETE cascade ON UPDATE no action;