CREATE TYPE "public"."impersonation_end_reason" AS ENUM('exited', 'signed_out');--> statement-breakpoint
CREATE TABLE "impersonation_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_user_id" integer,
	"subject_user_id" integer,
	"admin_clerk_id" text NOT NULL,
	"subject_clerk_id" text NOT NULL,
	"admin_clerk_session_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"end_reason" "impersonation_end_reason",
	"blocked_writes" integer DEFAULT 0 NOT NULL,
	"return_to" text,
	CONSTRAINT "impersonation_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "impersonation_sessions_end_pair" CHECK (("impersonation_sessions"."ended_at" IS NULL) = ("impersonation_sessions"."end_reason" IS NULL)),
	CONSTRAINT "impersonation_sessions_expires_after_start" CHECK ("impersonation_sessions"."expires_at" > "impersonation_sessions"."started_at"),
	CONSTRAINT "impersonation_sessions_not_self" CHECK ("impersonation_sessions"."admin_clerk_id" <> "impersonation_sessions"."subject_clerk_id"),
	CONSTRAINT "impersonation_sessions_blocked_writes_nonnegative" CHECK ("impersonation_sessions"."blocked_writes" >= 0),
	CONSTRAINT "impersonation_sessions_return_to_dashboard" CHECK ("impersonation_sessions"."return_to" IS NULL OR ("impersonation_sessions"."return_to" LIKE '/dashboard%' AND "impersonation_sessions"."return_to" NOT LIKE '//%'))
);
--> statement-breakpoint
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "impersonation_sessions_admin_started_idx" ON "impersonation_sessions" USING btree ("admin_user_id","started_at");--> statement-breakpoint
CREATE INDEX "impersonation_sessions_subject_started_idx" ON "impersonation_sessions" USING btree ("subject_user_id","started_at");