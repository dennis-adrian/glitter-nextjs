CREATE TABLE IF NOT EXISTS "festival_activity_participant_proofs" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_url" text NOT NULL,
	"participation_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "festival_activity_participant_proofs" ADD CONSTRAINT "festival_activity_participant_proofs_participation_id_festival_activity_participants_id_fk" FOREIGN KEY ("participation_id") REFERENCES "festival_activity_participants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
