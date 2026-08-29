-- This migration was regenerated after a migration-number collision during a
-- rebase. Some local databases already contain these tables from the original
-- landing CMS migration, so every operation must be safe to replay.
CREATE TABLE IF NOT EXISTS "landing_page_drafts" (
	"page_key" text PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"version" integer NOT NULL,
	"updated_by_user_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "landing_page_publications" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_key" text NOT NULL,
	"content" jsonb NOT NULL,
	"source_draft_version" integer NOT NULL,
	"published_by_user_id" integer,
	"published_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'landing_page_drafts_updated_by_user_id_users_id_fk'
			AND conrelid = 'public.landing_page_drafts'::regclass
	) THEN
		ALTER TABLE "landing_page_drafts" ADD CONSTRAINT "landing_page_drafts_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'landing_page_publications_published_by_user_id_users_id_fk'
			AND conrelid = 'public.landing_page_publications'::regclass
	) THEN
		ALTER TABLE "landing_page_publications" ADD CONSTRAINT "landing_page_publications_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "landing_page_publications_page_key_id_idx" ON "landing_page_publications" USING btree ("page_key","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "landing_page_publications_published_by_user_id_idx" ON "landing_page_publications" USING btree ("published_by_user_id");
