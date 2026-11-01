-- "Enviar a más personas" (docs/IMPLEMENTATION-comunicados.md A6a, G10).
--
-- Idempotent, as 0281 and 0304 are. An earlier version of this migration ran
-- on preview databases as 0305_comunicado_resends, stamped after
-- 0305_distribution_list_copies. Preview databases never re-run a recorded
-- migration, and Drizzle's migrator compares only the newest row's
-- created_at (0281), so:
--  - where the old 0305 ran, this would fail on objects that already exist;
--  - where it ran before 0305_distribution_list_copies did, that one is below
--    the high-water mark and skipped for good, so its DDL is re-applied here.
-- On a database migrated in order (production, CI, the test containers)
-- 0305 has run and every statement for it below is a no-op.

-- 0305_distribution_list_copies, re-applied.
CREATE TABLE IF NOT EXISTS "distribution_list_removals" (
	"list_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"removed_by_user_id" integer,
	"removed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "distribution_list_removals_list_id_user_id_pk" PRIMARY KEY("list_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('distribution_list_removals_user_id_users_id_fk', 63)) THEN
    ALTER TABLE "distribution_list_removals" ADD CONSTRAINT "distribution_list_removals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('distribution_list_removals_removed_by_user_id_users_id_fk', 63)) THEN
    ALTER TABLE "distribution_list_removals" ADD CONSTRAINT "distribution_list_removals_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "distribution_lists" ADD COLUMN IF NOT EXISTS "origin_festival_id" integer;--> statement-breakpoint
ALTER TABLE "distribution_lists" ADD COLUMN IF NOT EXISTS "origin_list_id" integer;--> statement-breakpoint
ALTER TABLE "distribution_lists" ADD COLUMN IF NOT EXISTS "origin_name" text;--> statement-breakpoint
ALTER TABLE "distribution_lists" ADD COLUMN IF NOT EXISTS "copied_at" timestamp;--> statement-breakpoint
ALTER TABLE "distribution_lists" ADD COLUMN IF NOT EXISTS "last_pulled_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('distribution_list_removals_list_id_distribution_lists_id_fk', 63)) THEN
    ALTER TABLE "distribution_list_removals" ADD CONSTRAINT "distribution_list_removals_list_id_distribution_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."distribution_lists"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "distribution_list_removals_user_idx" ON "distribution_list_removals" USING btree ("user_id");--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('distribution_lists_origin_festival_id_festivals_id_fk', 63)) THEN
    ALTER TABLE "distribution_lists" ADD CONSTRAINT "distribution_lists_origin_festival_id_festivals_id_fk" FOREIGN KEY ("origin_festival_id") REFERENCES "public"."festivals"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('distribution_lists_origin_list_id_distribution_lists_id_fk', 63)) THEN
    ALTER TABLE "distribution_lists" ADD CONSTRAINT "distribution_lists_origin_list_id_distribution_lists_id_fk" FOREIGN KEY ("origin_list_id") REFERENCES "public"."distribution_lists"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('distribution_lists_origin', 63)) THEN
    ALTER TABLE "distribution_lists" ADD CONSTRAINT "distribution_lists_origin" CHECK (num_nonnulls("distribution_lists"."origin_festival_id", "distribution_lists"."origin_list_id") <= 1
        AND ("distribution_lists"."origin_name" IS NULL) = ("distribution_lists"."copied_at" IS NULL)
        AND ("distribution_lists"."origin_name" IS NOT NULL OR ("distribution_lists"."origin_festival_id" IS NULL AND "distribution_lists"."origin_list_id" IS NULL AND "distribution_lists"."last_pulled_at" IS NULL))
        AND ("distribution_lists"."origin_name" IS NULL OR "distribution_lists"."kind" = 'fixed'));
  END IF;
END $$;--> statement-breakpoint

-- comunicado_resends, as generated from db/schema.ts.
CREATE TABLE IF NOT EXISTS "comunicado_resends" (
	"id" serial PRIMARY KEY NOT NULL,
	"comunicado_id" integer NOT NULL,
	"request_key" text NOT NULL,
	"includes_audience" boolean NOT NULL,
	"people" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"send_email" boolean NOT NULL,
	"send_push" boolean NOT NULL,
	"essential" boolean DEFAULT false NOT NULL,
	"essential_confirmed_by_user_id" integer,
	"revision" integer NOT NULL,
	"summary" jsonb NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "comunicado_resends_has_target" CHECK ("comunicado_resends"."includes_audience" OR jsonb_array_length("comunicado_resends"."people") > 0),
	CONSTRAINT "comunicado_resends_essential" CHECK (NOT "comunicado_resends"."essential" OR ("comunicado_resends"."send_email" AND "comunicado_resends"."includes_audience" AND jsonb_array_length("comunicado_resends"."people") = 0)),
	CONSTRAINT "comunicado_resends_essential_confirmed" CHECK ("comunicado_resends"."essential" = ("comunicado_resends"."essential_confirmed_by_user_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "notification_campaign_recipients" ADD COLUMN IF NOT EXISTS "resend_id" integer;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('comunicado_resends_comunicado_id_comunicados_id_fk', 63)) THEN
    ALTER TABLE "comunicado_resends" ADD CONSTRAINT "comunicado_resends_comunicado_id_comunicados_id_fk" FOREIGN KEY ("comunicado_id") REFERENCES "public"."comunicados"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('comunicado_resends_essential_confirmed_by_user_id_users_id_fk', 63)) THEN
    ALTER TABLE "comunicado_resends" ADD CONSTRAINT "comunicado_resends_essential_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("essential_confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('comunicado_resends_created_by_user_id_users_id_fk', 63)) THEN
    ALTER TABLE "comunicado_resends" ADD CONSTRAINT "comunicado_resends_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "comunicado_resends_request_key_unique" ON "comunicado_resends" USING btree ("request_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comunicado_resends_comunicado_idx" ON "comunicado_resends" USING btree ("comunicado_id","id");--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('notification_campaign_recipients_resend_id_comunicado_resends_id_fk', 63)) THEN
    ALTER TABLE "notification_campaign_recipients" ADD CONSTRAINT "notification_campaign_recipients_resend_id_comunicado_resends_id_fk" FOREIGN KEY ("resend_id") REFERENCES "public"."comunicado_resends"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
