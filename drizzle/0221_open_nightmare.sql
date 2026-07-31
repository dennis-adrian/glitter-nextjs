CREATE TYPE "public"."waitlist_entry_status" AS ENUM('waiting', 'invited', 'converted', 'removed');--> statement-breakpoint
CREATE TYPE "public"."waitlist_invitation_status" AS ENUM('sent', 'converted', 'expired', 'revoked');--> statement-breakpoint
CREATE TABLE "session_waitlist_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"occurrence_id" integer NOT NULL,
	"user_id" integer,
	"guest_name" text,
	"guest_email" text,
	"guest_phone" text,
	"status" "waitlist_entry_status" DEFAULT 'waiting' NOT NULL,
	"notes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_waitlist_entries_identity_check" CHECK ((
        ("session_waitlist_entries"."user_id" IS NOT NULL AND "session_waitlist_entries"."guest_name" IS NULL AND "session_waitlist_entries"."guest_email" IS NULL AND "session_waitlist_entries"."guest_phone" IS NULL)
        OR
        ("session_waitlist_entries"."user_id" IS NULL
         AND "session_waitlist_entries"."guest_name" IS NOT NULL AND length(trim("session_waitlist_entries"."guest_name")) > 0
         AND "session_waitlist_entries"."guest_email" IS NOT NULL AND length(trim("session_waitlist_entries"."guest_email")) > 0
         AND "session_waitlist_entries"."guest_phone" IS NOT NULL AND length(trim("session_waitlist_entries"."guest_phone")) > 0)
      ))
);
--> statement-breakpoint
CREATE TABLE "session_waitlist_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"waitlist_entry_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"status" "waitlist_invitation_status" DEFAULT 'sent' NOT NULL,
	"invited_by_user_id" integer,
	"reason" text NOT NULL,
	"purchase_id" integer,
	"converted_at" timestamp,
	"revoked_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_waitlist_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "session_waitlist_invitations_reason_present" CHECK (length(trim("session_waitlist_invitations"."reason")) > 0),
	CONSTRAINT "session_waitlist_invitations_terminal_timestamps" CHECK (("session_waitlist_invitations"."status" <> 'converted' OR "session_waitlist_invitations"."converted_at" IS NOT NULL)
        AND ("session_waitlist_invitations"."status" <> 'revoked' OR "session_waitlist_invitations"."revoked_at" IS NOT NULL)
        AND ("session_waitlist_invitations"."status" <> 'converted' OR "session_waitlist_invitations"."purchase_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "session_waitlist_entries" ADD CONSTRAINT "session_waitlist_entries_occurrence_id_session_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."session_occurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_waitlist_entries" ADD CONSTRAINT "session_waitlist_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_waitlist_invitations" ADD CONSTRAINT "session_waitlist_invitations_waitlist_entry_id_session_waitlist_entries_id_fk" FOREIGN KEY ("waitlist_entry_id") REFERENCES "public"."session_waitlist_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_waitlist_invitations" ADD CONSTRAINT "session_waitlist_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_waitlist_invitations" ADD CONSTRAINT "session_waitlist_invitations_purchase_id_session_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."session_purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_waitlist_entries_occurrence_user_idx" ON "session_waitlist_entries" USING btree ("occurrence_id","user_id") WHERE "session_waitlist_entries"."status" <> 'removed' AND "session_waitlist_entries"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "session_waitlist_entries_occurrence_email_idx" ON "session_waitlist_entries" USING btree ("occurrence_id",lower("guest_email")) WHERE "session_waitlist_entries"."status" <> 'removed' AND "session_waitlist_entries"."guest_email" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "session_waitlist_entries_occurrence_status_idx" ON "session_waitlist_entries" USING btree ("occurrence_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "session_waitlist_invitations_live_idx" ON "session_waitlist_invitations" USING btree ("waitlist_entry_id") WHERE "session_waitlist_invitations"."status" = 'sent';--> statement-breakpoint
CREATE INDEX "session_waitlist_invitations_status_expires_idx" ON "session_waitlist_invitations" USING btree ("status","expires_at");