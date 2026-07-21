CREATE TYPE "public"."infraction_event_type" AS ENUM('created', 'edited', 'review_started', 'resolved', 'voided', 'reopened', 'sanction_linked', 'duplicate_confirmed');--> statement-breakpoint
CREATE TYPE "public"."infraction_status" AS ENUM('pending', 'under_review', 'resolved', 'voided');--> statement-breakpoint
CREATE TABLE "infraction_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"infraction_id" integer NOT NULL,
	"actor_user_id" integer,
	"event_type" "infraction_event_type" NOT NULL,
	"from_status" "infraction_status",
	"to_status" "infraction_status",
	"changes" jsonb,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infraction_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"infraction_id" integer NOT NULL,
	"added_by_user_id" integer NOT NULL,
	"label" text,
	"url" text NOT NULL,
	"mime_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infraction_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"infraction_id" integer NOT NULL,
	"author_user_id" integer NOT NULL,
	"content" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "infractions" DROP CONSTRAINT "infractions_type_id_infraction_types_id_fk";
--> statement-breakpoint
ALTER TABLE "infractions" DROP CONSTRAINT "infractions_festival_id_festivals_id_fk";
--> statement-breakpoint
ALTER TABLE "sanctions" DROP CONSTRAINT "sanctions_infraction_id_infractions_id_fk";
--> statement-breakpoint
ALTER TABLE "infractions" ADD COLUMN "status" "infraction_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
UPDATE "infractions" SET "status" = CASE WHEN "handled" = true THEN 'resolved'::"infraction_status" ELSE 'pending'::"infraction_status" END;--> statement-breakpoint
ALTER TABLE "infractions" ADD COLUMN "created_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "infractions" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "infractions" ADD COLUMN "resolved_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "infractions" ADD COLUMN "resolution_notes" text;--> statement-breakpoint
ALTER TABLE "infractions" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "infractions" ADD COLUMN "voided_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "infractions" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "infractions" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "infraction_events" ADD CONSTRAINT "infraction_events_infraction_id_infractions_id_fk" FOREIGN KEY ("infraction_id") REFERENCES "public"."infractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infraction_events" ADD CONSTRAINT "infraction_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infraction_evidence" ADD CONSTRAINT "infraction_evidence_infraction_id_infractions_id_fk" FOREIGN KEY ("infraction_id") REFERENCES "public"."infractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infraction_evidence" ADD CONSTRAINT "infraction_evidence_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infraction_notes" ADD CONSTRAINT "infraction_notes_infraction_id_infractions_id_fk" FOREIGN KEY ("infraction_id") REFERENCES "public"."infractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infraction_notes" ADD CONSTRAINT "infraction_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "infraction_events_infraction_id_created_at_idx" ON "infraction_events" USING btree ("infraction_id","created_at");--> statement-breakpoint
CREATE INDEX "infraction_evidence_infraction_id_created_at_idx" ON "infraction_evidence" USING btree ("infraction_id","created_at");--> statement-breakpoint
CREATE INDEX "infraction_notes_infraction_id_created_at_idx" ON "infraction_notes" USING btree ("infraction_id","created_at");--> statement-breakpoint
ALTER TABLE "infractions" ADD CONSTRAINT "infractions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infractions" ADD CONSTRAINT "infractions_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infractions" ADD CONSTRAINT "infractions_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infractions" ADD CONSTRAINT "infractions_type_id_infraction_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."infraction_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infractions" ADD CONSTRAINT "infractions_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_infraction_id_infractions_id_fk" FOREIGN KEY ("infraction_id") REFERENCES "public"."infractions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "infractions_user_id_created_at_idx" ON "infractions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "infractions_festival_id_created_at_idx" ON "infractions" USING btree ("festival_id","created_at");--> statement-breakpoint
CREATE INDEX "infractions_type_id_created_at_idx" ON "infractions" USING btree ("type_id","created_at");--> statement-breakpoint
CREATE INDEX "infractions_status_created_at_idx" ON "infractions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "infractions_user_gave_notice_created_at_idx" ON "infractions" USING btree ("user_gave_notice","created_at");--> statement-breakpoint
ALTER TABLE "infractions" ADD CONSTRAINT "infractions_idempotency_key_unique" UNIQUE("idempotency_key");