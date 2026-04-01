CREATE TYPE "public"."live_act_category" AS ENUM('music', 'dance', 'talk');--> statement-breakpoint
CREATE TYPE "public"."live_act_status" AS ENUM('pending', 'backlog', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "live_acts" (
	"id" serial PRIMARY KEY NOT NULL,
	"act_name" text NOT NULL,
	"category" "live_act_category" NOT NULL,
	"description" text,
	"resource_link" text,
	"social_links" jsonb DEFAULT '[]'::jsonb,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text NOT NULL,
	"status" "live_act_status" DEFAULT 'pending' NOT NULL,
	"admin_notes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
