CREATE TYPE "public"."occurrence_lifecycle_status" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."program_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."session_audience" AS ENUM('all', 'participants_only', 'public_only');--> statement-breakpoint
CREATE TYPE "public"."session_skill_level" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."session_type" AS ENUM('talk', 'workshop');--> statement-breakpoint
CREATE TABLE "program_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"type" "session_type" NOT NULL,
	"topic" text,
	"description" text,
	"learning_outcomes" jsonb DEFAULT '[]'::jsonb,
	"skill_level" "session_skill_level",
	"image_url" text,
	"audience" "session_audience" DEFAULT 'all' NOT NULL,
	"public_price" numeric(10, 2) DEFAULT 0 NOT NULL,
	"participant_price" numeric(10, 2),
	"status" "program_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp,
	"venue_id" integer,
	"display_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "program_sessions_program_id_slug_unique" UNIQUE("program_id","slug"),
	CONSTRAINT "program_sessions_public_price_positive" CHECK ("program_sessions"."public_price" >= 0),
	CONSTRAINT "program_sessions_participant_price_valid" CHECK ("program_sessions"."participant_price" IS NULL
        OR ("program_sessions"."participant_price" >= 0 AND "program_sessions"."participant_price" <= "program_sessions"."public_price"))
);
--> statement-breakpoint
CREATE TABLE "program_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"default_participant_discount_percent" numeric(5, 2) DEFAULT 0 NOT NULL,
	"default_hold_minutes" integer DEFAULT 20 NOT NULL,
	"default_occurrence_capacity" integer DEFAULT 20 NOT NULL,
	"default_waitlist_invitation_window_minutes" integer DEFAULT 1440 NOT NULL,
	"attendee_cancellation_cutoff_hours" integer DEFAULT 48 NOT NULL,
	"bank_qr_image_url" text,
	"no_refund_policy_version" text DEFAULT 'v1' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "program_settings_key_unique" UNIQUE("key"),
	CONSTRAINT "program_settings_positive_durations" CHECK ("program_settings"."default_hold_minutes" > 0
        AND "program_settings"."default_occurrence_capacity" > 0
        AND "program_settings"."default_waitlist_invitation_window_minutes" > 0
        AND "program_settings"."attendee_cancellation_cutoff_hours" > 0),
	CONSTRAINT "program_settings_discount_range" CHECK ("program_settings"."default_participant_discount_percent" >= 0
        AND "program_settings"."default_participant_discount_percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"summary" text,
	"description" text,
	"banner_url" text,
	"thumbnail_url" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"status" "program_status" DEFAULT 'draft' NOT NULL,
	"festival_id" integer,
	"default_venue_id" integer,
	"participant_discount_percent" numeric(5, 2),
	"waitlist_invitation_window_minutes" integer,
	"hold_minutes" integer,
	"published_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "programs_slug_unique" UNIQUE("slug"),
	CONSTRAINT "programs_date_range_valid" CHECK ("programs"."end_date" IS NULL OR "programs"."start_date" IS NULL OR "programs"."end_date" >= "programs"."start_date"),
	CONSTRAINT "programs_discount_range" CHECK ("programs"."participant_discount_percent" IS NULL
        OR ("programs"."participant_discount_percent" >= 0 AND "programs"."participant_discount_percent" <= 100)),
	CONSTRAINT "programs_positive_overrides" CHECK (("programs"."waitlist_invitation_window_minutes" IS NULL OR "programs"."waitlist_invitation_window_minutes" > 0)
        AND ("programs"."hold_minutes" IS NULL OR "programs"."hold_minutes" > 0))
);
--> statement-breakpoint
CREATE TABLE "session_occurrence_schedule_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"occurrence_id" integer NOT NULL,
	"from_starts_at" timestamp NOT NULL,
	"from_ends_at" timestamp NOT NULL,
	"to_starts_at" timestamp NOT NULL,
	"to_ends_at" timestamp NOT NULL,
	"from_venue_id" integer,
	"to_venue_id" integer,
	"from_room" text,
	"to_room" text,
	"reason" text NOT NULL,
	"actor_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_occurrences" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"venue_id" integer,
	"room" text,
	"capacity" integer DEFAULT 20 NOT NULL,
	"sales_start_at" timestamp,
	"sales_end_at" timestamp,
	"sales_closed_at" timestamp,
	"lifecycle_status" "occurrence_lifecycle_status" DEFAULT 'scheduled' NOT NULL,
	"cancelled_at" timestamp,
	"cancelled_reason" text,
	"completed_at" timestamp,
	"rescheduled_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_occurrences_time_range_valid" CHECK ("session_occurrences"."ends_at" > "session_occurrences"."starts_at"),
	CONSTRAINT "session_occurrences_capacity_positive" CHECK ("session_occurrences"."capacity" > 0),
	CONSTRAINT "session_occurrences_sales_window_valid" CHECK ("session_occurrences"."sales_end_at" IS NULL OR "session_occurrences"."sales_start_at" IS NULL OR "session_occurrences"."sales_end_at" >= "session_occurrences"."sales_start_at"),
	CONSTRAINT "session_occurrences_cancelled_consistent" CHECK ("session_occurrences"."lifecycle_status" <> 'cancelled' OR "session_occurrences"."cancelled_at" IS NOT NULL),
	CONSTRAINT "session_occurrences_completed_consistent" CHECK ("session_occurrences"."lifecycle_status" <> 'completed' OR "session_occurrences"."completed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "session_speakers" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"speaker_id" integer NOT NULL,
	"role" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_speakers_session_id_speaker_id_unique" UNIQUE("session_id","speaker_id")
);
--> statement-breakpoint
CREATE TABLE "speakers" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_name" text NOT NULL,
	"image_url" text,
	"bio" text,
	"links" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"location_label" text,
	"location_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "program_sessions" ADD CONSTRAINT "program_sessions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_sessions" ADD CONSTRAINT "program_sessions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_default_venue_id_venues_id_fk" FOREIGN KEY ("default_venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_occurrence_schedule_changes" ADD CONSTRAINT "session_occurrence_schedule_changes_occurrence_id_session_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."session_occurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_occurrence_schedule_changes" ADD CONSTRAINT "session_occurrence_schedule_changes_from_venue_id_venues_id_fk" FOREIGN KEY ("from_venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_occurrence_schedule_changes" ADD CONSTRAINT "session_occurrence_schedule_changes_to_venue_id_venues_id_fk" FOREIGN KEY ("to_venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_occurrence_schedule_changes" ADD CONSTRAINT "session_occurrence_schedule_changes_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_occurrences" ADD CONSTRAINT "session_occurrences_session_id_program_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."program_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_occurrences" ADD CONSTRAINT "session_occurrences_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_speakers" ADD CONSTRAINT "session_speakers_session_id_program_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."program_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_speakers" ADD CONSTRAINT "session_speakers_speaker_id_speakers_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."speakers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "program_sessions_program_id_status_idx" ON "program_sessions" USING btree ("program_id","status");--> statement-breakpoint
CREATE INDEX "programs_status_idx" ON "programs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "programs_festival_id_idx" ON "programs" USING btree ("festival_id");--> statement-breakpoint
CREATE INDEX "session_occurrence_schedule_changes_occurrence_idx" ON "session_occurrence_schedule_changes" USING btree ("occurrence_id","created_at");--> statement-breakpoint
CREATE INDEX "session_occurrences_session_id_starts_at_idx" ON "session_occurrences" USING btree ("session_id","starts_at");--> statement-breakpoint
CREATE INDEX "session_occurrences_lifecycle_starts_at_idx" ON "session_occurrences" USING btree ("lifecycle_status","starts_at");