CREATE TABLE "user_email_changes" (
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
ALTER TABLE "user_email_changes" ADD CONSTRAINT "user_email_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_email_changes" ADD CONSTRAINT "user_email_changes_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_email_changes_user_created_idx" ON "user_email_changes" USING btree ("user_id","created_at");