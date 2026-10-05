CREATE TYPE "public"."email_suppression_reason" AS ENUM('bounce', 'complaint');--> statement-breakpoint
CREATE TYPE "public"."email_topic" AS ENUM('visitor_invitations', 'participant_invitations');--> statement-breakpoint
CREATE TABLE "email_suppressions" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_key" text NOT NULL,
	"reason" "email_suppression_reason" NOT NULL,
	"resend_email_id" text,
	"detail" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppressions_email_key_normalized" CHECK ("email_suppressions"."email_key" = lower(trim("email_suppressions"."email_key")) and "email_suppressions"."email_key" <> '')
);
--> statement-breakpoint
CREATE TABLE "email_unsubscribes" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_key" text NOT NULL,
	"topic" "email_topic" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_unsubscribes_email_key_normalized" CHECK ("email_unsubscribes"."email_key" = lower(trim("email_unsubscribes"."email_key")) and "email_unsubscribes"."email_key" <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "email_suppressions_email_key_unique" ON "email_suppressions" USING btree ("email_key");--> statement-breakpoint
CREATE UNIQUE INDEX "email_unsubscribes_email_key_topic_unique" ON "email_unsubscribes" USING btree ("email_key","topic");