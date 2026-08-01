CREATE TABLE "stand_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"festival_sector_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stands" ADD COLUMN "stand_group_id" integer;--> statement-breakpoint
ALTER TABLE "stand_groups" ADD CONSTRAINT "stand_groups_festival_sector_id_festival_sectors_id_fk" FOREIGN KEY ("festival_sector_id") REFERENCES "public"."festival_sectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stand_groups_festival_sector_id_idx" ON "stand_groups" USING btree ("festival_sector_id");--> statement-breakpoint
ALTER TABLE "stands" ADD CONSTRAINT "stands_stand_group_id_stand_groups_id_fk" FOREIGN KEY ("stand_group_id") REFERENCES "public"."stand_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stands_stand_group_id_idx" ON "stands" USING btree ("stand_group_id");