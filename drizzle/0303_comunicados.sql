-- The foreign keys need users and notification_campaigns, and the new column
-- needs notification_campaign_recipients. All three are locked first, since
-- the statements below would take recipients first: users before the campaign
-- tables, as a profile deletion deletes the user row and then cascades onto
-- both, and campaigns before recipients, as the credit-gift paths do.
-- A release that also applies 0301 still has a narrow window against a gift
-- being processed, since 0301 locks notifications first: a retried gift
-- attempt, or a failed build that a redeploy retries. Release 0301 and 0302
-- before 0303 when possible.
LOCK TABLE "users" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
LOCK TABLE "notification_campaigns" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
LOCK TABLE "notification_campaign_recipients" IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
CREATE TYPE "public"."campaign_recipient_source" AS ENUM('list', 'person', 'staging_admin');--> statement-breakpoint
CREATE TYPE "public"."comunicado_status" AS ENUM('draft', 'scheduled', 'sent');--> statement-breakpoint
ALTER TYPE "public"."notification_campaign_recipient_status" ADD VALUE 'notified';--> statement-breakpoint
ALTER TYPE "public"."notification_campaign_type" ADD VALUE 'comunicado';--> statement-breakpoint
CREATE TABLE "comunicado_revisions" (
	"comunicado_id" integer NOT NULL,
	"revision" integer NOT NULL,
	"title" text NOT NULL,
	"doc" jsonb NOT NULL,
	"html" text NOT NULL,
	"text" text NOT NULL,
	"action_label" text,
	"action_path" text,
	"edit_note" text,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "comunicado_revisions_comunicado_id_revision_pk" PRIMARY KEY("comunicado_id","revision"),
	CONSTRAINT "comunicado_revisions_revision_positive" CHECK ("comunicado_revisions"."revision" >= 1),
	CONSTRAINT "comunicado_revisions_title_length" CHECK (char_length("comunicado_revisions"."title") BETWEEN 1 AND 80),
	CONSTRAINT "comunicado_revisions_action_pair" CHECK (("comunicado_revisions"."action_label" IS NULL) = ("comunicado_revisions"."action_path" IS NULL)),
	CONSTRAINT "comunicado_revisions_action_path_safe" CHECK ("comunicado_revisions"."action_path" IS NULL OR (left("comunicado_revisions"."action_path", 1) = '/' AND substr("comunicado_revisions"."action_path", 2, 1) NOT IN ('/', E'\\') AND "comunicado_revisions"."action_path" !~ '[[:cntrl:][:space:]]')),
	CONSTRAINT "comunicado_revisions_edit_note_length" CHECK ("comunicado_revisions"."edit_note" IS NULL OR char_length("comunicado_revisions"."edit_note") <= 300)
);
--> statement-breakpoint
CREATE TABLE "comunicados" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" "comunicado_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"autosave_key" text,
	"title" text DEFAULT '' NOT NULL,
	"doc" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"action_label" text,
	"action_path" text,
	"send_email" boolean DEFAULT true NOT NULL,
	"send_push" boolean DEFAULT false NOT NULL,
	"audience" jsonb DEFAULT '{"festivals":[],"lists":[],"people":[]}'::jsonb NOT NULL,
	"essential" boolean DEFAULT false NOT NULL,
	"essential_reason" text,
	"essential_confirmed_by_user_id" integer,
	"essential_confirmed_at" timestamp,
	"scheduled_at" timestamp,
	"scheduled_by_user_id" integer,
	"schedule_missed_at" timestamp,
	"schedule_missed_reason" text,
	"schedule_missed_detail" text,
	"campaign_id" integer,
	"current_revision" integer,
	"audience_summary" jsonb,
	"sent_at" timestamp,
	"sent_by_user_id" integer,
	"retracted_at" timestamp,
	"retracted_by_user_id" integer,
	"retract_reason" text,
	"created_by_user_id" integer,
	"updated_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "comunicados_sent_has_campaign" CHECK (("comunicados"."status" = 'sent') = ("comunicados"."campaign_id" IS NOT NULL)),
	CONSTRAINT "comunicados_sent_has_revision" CHECK (("comunicados"."status" = 'sent') = ("comunicados"."current_revision" IS NOT NULL)),
	CONSTRAINT "comunicados_schedule_matches" CHECK (("comunicados"."status" <> 'scheduled' OR "comunicados"."scheduled_at" IS NOT NULL) AND ("comunicados"."status" <> 'draft' OR "comunicados"."scheduled_at" IS NULL)),
	CONSTRAINT "comunicados_missed_only_draft" CHECK ("comunicados"."schedule_missed_at" IS NULL OR "comunicados"."status" = 'draft'),
	CONSTRAINT "comunicados_missed_reason" CHECK (("comunicados"."schedule_missed_at" IS NULL) = ("comunicados"."schedule_missed_reason" IS NULL) AND ("comunicados"."schedule_missed_reason" IS NULL OR "comunicados"."schedule_missed_reason" IN ('late', 'too_large', 'empty', 'invalid', 'sender_not_admin'))),
	CONSTRAINT "comunicados_retracted_was_sent" CHECK ("comunicados"."retracted_at" IS NULL OR "comunicados"."status" = 'sent'),
	CONSTRAINT "comunicados_retract_reason" CHECK (("comunicados"."retracted_at" IS NULL) = ("comunicados"."retract_reason" IS NULL)),
	CONSTRAINT "comunicados_essential" CHECK ("comunicados"."status" = 'draft' OR NOT "comunicados"."essential" OR ("comunicados"."send_email" AND "comunicados"."essential_reason" IS NOT NULL)),
	CONSTRAINT "comunicados_essential_confirmed" CHECK (("comunicados"."essential_confirmed_at" IS NULL) = ("comunicados"."essential_confirmed_by_user_id" IS NULL) AND ("comunicados"."essential_confirmed_at" IS NULL OR "comunicados"."essential")),
	CONSTRAINT "comunicados_essential_recorded" CHECK ("comunicados"."status" <> 'sent' OR NOT "comunicados"."essential" OR "comunicados"."essential_confirmed_at" IS NOT NULL),
	CONSTRAINT "comunicados_action_pair" CHECK ("comunicados"."status" = 'draft' OR (("comunicados"."action_label" IS NULL) = ("comunicados"."action_path" IS NULL))),
	CONSTRAINT "comunicados_action_path_safe" CHECK ("comunicados"."status" = 'draft' OR "comunicados"."action_path" IS NULL OR (left("comunicados"."action_path", 1) = '/' AND substr("comunicados"."action_path", 2, 1) NOT IN ('/', E'\\') AND "comunicados"."action_path" !~ '[[:cntrl:][:space:]]'))
);
--> statement-breakpoint
ALTER TABLE "notification_campaign_recipients" ADD COLUMN "source" "campaign_recipient_source";--> statement-breakpoint
ALTER TABLE "comunicado_revisions" ADD CONSTRAINT "comunicado_revisions_comunicado_id_comunicados_id_fk" FOREIGN KEY ("comunicado_id") REFERENCES "public"."comunicados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicado_revisions" ADD CONSTRAINT "comunicado_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicados" ADD CONSTRAINT "comunicados_essential_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("essential_confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicados" ADD CONSTRAINT "comunicados_scheduled_by_user_id_users_id_fk" FOREIGN KEY ("scheduled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicados" ADD CONSTRAINT "comunicados_campaign_id_notification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."notification_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicados" ADD CONSTRAINT "comunicados_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicados" ADD CONSTRAINT "comunicados_retracted_by_user_id_users_id_fk" FOREIGN KEY ("retracted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicados" ADD CONSTRAINT "comunicados_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicados" ADD CONSTRAINT "comunicados_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comunicados_campaign_id_unique" ON "comunicados" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "comunicados_scheduled_idx" ON "comunicados" USING btree ("scheduled_at") WHERE "comunicados"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "comunicados_status_updated_idx" ON "comunicados" USING btree ("status","updated_at");