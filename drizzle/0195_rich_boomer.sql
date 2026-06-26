CREATE TYPE "public"."store_status_mode" AS ENUM('auto', 'open', 'closed');--> statement-breakpoint
CREATE TABLE "store_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"mode" "store_status_mode" DEFAULT 'auto' NOT NULL,
	"closed_title" text,
	"closed_message" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
