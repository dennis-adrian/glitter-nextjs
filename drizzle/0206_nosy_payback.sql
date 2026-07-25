CREATE TABLE "pending_user_deletions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"clerk_id" text NOT NULL,
	"clerk_deleted_at" timestamp,
	"local_deleted_at" timestamp,
	"last_error" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pending_user_deletions" ADD CONSTRAINT "pending_user_deletions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_user_deletions_clerk_id_idx" ON "pending_user_deletions" USING btree ("clerk_id");--> statement-breakpoint
CREATE INDEX "pending_user_deletions_reconcile_idx" ON "pending_user_deletions" USING btree ("clerk_deleted_at","local_deleted_at");