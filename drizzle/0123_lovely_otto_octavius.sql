CREATE TYPE "public"."votable_type" AS ENUM('participant', 'stand');--> statement-breakpoint
CREATE TABLE "festival_activity_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"voter_id" integer NOT NULL,
	"activity_id" integer NOT NULL,
	"votable_type" "votable_type" DEFAULT 'participant' NOT NULL,
	"stand_id" integer,
	"participant_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_voter_activity" UNIQUE("voter_id","activity_id")
);
--> statement-breakpoint
ALTER TABLE "festival_activities" ADD COLUMN "allows_voting" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "festival_activities" ADD COLUMN "voting_start_date" timestamp;--> statement-breakpoint
ALTER TABLE "festival_activities" ADD COLUMN "voting_end_date" timestamp;--> statement-breakpoint
ALTER TABLE "festival_activity_votes" ADD CONSTRAINT "festival_activity_votes_voter_id_users_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_activity_votes" ADD CONSTRAINT "festival_activity_votes_activity_id_festival_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."festival_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_activity_votes" ADD CONSTRAINT "festival_activity_votes_stand_id_stands_id_fk" FOREIGN KEY ("stand_id") REFERENCES "public"."stands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_activity_votes" ADD CONSTRAINT "festival_activity_votes_participant_id_festival_activity_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."festival_activity_participants"("id") ON DELETE cascade ON UPDATE no action;