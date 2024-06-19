CREATE TABLE IF NOT EXISTS "festival_dates" (
	"id" serial PRIMARY KEY NOT NULL,
	"festival_id" integer NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "festival_dates_festival_id_idx" ON "festival_dates" ("festival_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "festival_dates" ADD CONSTRAINT "festival_dates_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "festivals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
