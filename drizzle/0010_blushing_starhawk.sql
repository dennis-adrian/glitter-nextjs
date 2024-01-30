DO $$ BEGIN
 CREATE TYPE "user_social_type" AS ENUM('instagram', 'facebook', 'tiktok', 'twitter', 'youtube');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_socials" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" "user_social_type" NOT NULL,
	"username" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_socials" ADD CONSTRAINT "user_socials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
