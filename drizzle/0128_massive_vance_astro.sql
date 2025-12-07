ALTER TABLE "festival_activity_votes" RENAME COLUMN "activity_id" TO "activity_variant_id";--> statement-breakpoint
ALTER TABLE "festival_activity_votes" DROP CONSTRAINT "unique_voter_activity";--> statement-breakpoint
ALTER TABLE "festival_activity_votes" DROP CONSTRAINT "festival_activity_votes_activity_id_festival_activities_id_fk";
--> statement-breakpoint
ALTER TABLE "festival_activity_votes" ADD CONSTRAINT "festival_activity_votes_activity_variant_id_festival_activity_details_id_fk" FOREIGN KEY ("activity_variant_id") REFERENCES "public"."festival_activity_details"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_activity_votes" ADD CONSTRAINT "unique_voter_activity" UNIQUE("voter_id","activity_variant_id");