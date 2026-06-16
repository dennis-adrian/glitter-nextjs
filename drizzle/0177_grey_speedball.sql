CREATE TYPE "public"."external_participant_type" AS ENUM('institution', 'social_organization', 'sponsor', 'partner', 'public_entity', 'invited_brand', 'other');--> statement-breakpoint
CREATE TYPE "public"."reservation_source" AS ENUM('user_reservation', 'admin_assignment');--> statement-breakpoint
CREATE TABLE "external_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"type" "external_participant_type" NOT NULL,
	"custom_category_label" text,
	"description" text,
	"image_url" text,
	"website_url" text,
	"instagram_url" text,
	"contact_email" text,
	"created_by_user_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_external_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_participant_id" integer NOT NULL,
	"reservation_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_external_participants_unique" UNIQUE("external_participant_id","reservation_id")
);
--> statement-breakpoint
ALTER TABLE "external_participants" ADD CONSTRAINT "external_participants_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_external_participants" ADD CONSTRAINT "reservation_external_participants_external_participant_id_external_participants_id_fk" FOREIGN KEY ("external_participant_id") REFERENCES "public"."external_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_external_participants" ADD CONSTRAINT "reservation_external_participants_reservation_id_stand_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."stand_reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "external_participants_display_name_idx" ON "external_participants" USING btree ("display_name");