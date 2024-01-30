DO $$ BEGIN
 CREATE TYPE "user_request_type" AS ENUM('become_artist', 'festival_participation');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"festival_id" integer,
	"type" "user_request_type" DEFAULT 'become_artist' NOT NULL,
	"status" "participation_request_status",
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_requests" ADD CONSTRAINT "user_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_requests" ADD CONSTRAINT "user_requests_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "festivals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
