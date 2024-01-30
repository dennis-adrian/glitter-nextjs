DROP TABLE "participation_requests";--> statement-breakpoint
ALTER TABLE "users_to_socials" DROP CONSTRAINT "users_to_socials_social_id_users_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users_to_socials" ADD CONSTRAINT "users_to_socials_social_id_socials_id_fk" FOREIGN KEY ("social_id") REFERENCES "socials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
