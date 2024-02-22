DO $$ BEGIN
 CREATE TYPE "ticket_status" AS ENUM('pending', 'checked_in');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" timestamp NOT NULL,
	"status" "ticket_status" DEFAULT 'pending' NOT NULL,
	"visitor_id" integer NOT NULL,
	"festival_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visitors" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text NOT NULL,
	"phone_number" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "visitors_email_unique" UNIQUE("email")
);
