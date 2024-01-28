DO $$ BEGIN
 CREATE TYPE "user_role" AS ENUM('admin', 'artist', 'user');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "socials" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "socials_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"display_name" text,
	"first_name" text,
	"image_url" text,
	"last_name" text,
	"phone_number" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users_to_socials" (
	"user_id" integer NOT NULL,
	"social_id" integer NOT NULL,
	"username" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_to_socials_user_id_social_id_pk" PRIMARY KEY("user_id","social_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "display_name_idx" ON "users" ("display_name");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users_to_socials" ADD CONSTRAINT "users_to_socials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users_to_socials" ADD CONSTRAINT "users_to_socials_social_id_users_id_fk" FOREIGN KEY ("social_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
