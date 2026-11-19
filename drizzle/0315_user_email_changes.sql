-- The audit of admin email changes (`user_email_changes`).
--
-- Safe to run on a database that already has the table: this was 0314 while
-- it was built, before develop took that number, and the preview database ran
-- it then. Every statement only adds what is missing.
CREATE TABLE IF NOT EXISTS "user_email_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"clerk_id" text NOT NULL,
	"old_email" text NOT NULL,
	"new_email" text NOT NULL,
	"changed_by_user_id" integer,
	"unlinked_providers" text[] DEFAULT '{}'::text[] NOT NULL,
	"clerk_changed_at" timestamp,
	"completed_at" timestamp,
	"last_error" text,
	"old_notice_status" text,
	"new_notice_status" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'user_email_changes_user_id_users_id_fk'
			AND conrelid = 'public.user_email_changes'::regclass
	) THEN
		ALTER TABLE "user_email_changes" ADD CONSTRAINT "user_email_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'user_email_changes_changed_by_user_id_users_id_fk'
			AND conrelid = 'public.user_email_changes'::regclass
	) THEN
		ALTER TABLE "user_email_changes" ADD CONSTRAINT "user_email_changes_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_email_changes_user_created_idx" ON "user_email_changes" USING btree ("user_id","created_at");
