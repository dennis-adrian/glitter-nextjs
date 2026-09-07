CREATE TYPE "public"."attendance_method" AS ENUM('qr_scan', 'manual_code');--> statement-breakpoint
CREATE TYPE "public"."participant_eligibility" AS ENUM('active_participant', 'public');--> statement-breakpoint
CREATE TYPE "public"."purchase_actor_type" AS ENUM('buyer', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."purchase_line_source" AS ENUM('individual_session', 'pass_session');--> statement-breakpoint
CREATE TYPE "public"."session_purchase_event_type" AS ENUM('created', 'voucher_uploaded', 'voucher_replaced', 'changes_requested', 'approved', 'rejected', 'cancelled_by_buyer', 'cancelled_by_admin', 'expired', 'ticket_issued', 'ticket_cancelled', 'adjusted', 'link_resent', 'emails_resent', 'refund_requested', 'refund_resolved', 'upgrade_initiated', 'upgrade_completed');--> statement-breakpoint
CREATE TYPE "public"."session_purchase_payment_mode" AS ENUM('bank_qr', 'free');--> statement-breakpoint
CREATE TYPE "public"."session_purchase_status" AS ENUM('pending_upload', 'under_verification', 'changes_requested', 'approved', 'rejected', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."session_ticket_status" AS ENUM('valid', 'cancelled');--> statement-breakpoint
CREATE TABLE "session_attendances" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"occurrence_id" integer NOT NULL,
	"checked_in_at" timestamp DEFAULT now() NOT NULL,
	"operator_user_id" integer,
	"method" "attendance_method" DEFAULT 'qr_scan' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_attendances_ticket_id_unique" UNIQUE("ticket_id")
);
--> statement-breakpoint
CREATE TABLE "session_purchase_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_id" integer NOT NULL,
	"actor_type" "purchase_actor_type" NOT NULL,
	"actor_user_id" integer,
	"event_type" "session_purchase_event_type" NOT NULL,
	"from_status" "session_purchase_status",
	"to_status" "session_purchase_status",
	"reason" text,
	"changes" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_purchase_events_admin_needs_reason" CHECK ("session_purchase_events"."actor_type" <> 'admin' OR ("session_purchase_events"."reason" IS NOT NULL AND length(trim("session_purchase_events"."reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "session_purchase_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_id" integer NOT NULL,
	"occurrence_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"source" "purchase_line_source" DEFAULT 'individual_session' NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"price_basis" "participant_eligibility" NOT NULL,
	"pricing_snapshot" jsonb NOT NULL,
	"session_title_snapshot" text NOT NULL,
	"occurrence_starts_at_snapshot" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_purchase_lines_purchase_id_occurrence_id_unique" UNIQUE("purchase_id","occurrence_id"),
	CONSTRAINT "session_purchase_lines_id_occurrence_id_unique" UNIQUE("id","occurrence_id"),
	CONSTRAINT "session_purchase_lines_price_positive" CHECK ("session_purchase_lines"."unit_price" >= 0),
	CONSTRAINT "session_purchase_lines_pass_line_free" CHECK ("session_purchase_lines"."source" <> 'pass_session' OR "session_purchase_lines"."unit_price" = 0)
);
--> statement-breakpoint
CREATE TABLE "session_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer NOT NULL,
	"user_id" integer,
	"guest_name" text,
	"guest_email" text,
	"guest_phone" text,
	"access_token_hash" text NOT NULL,
	"access_token_revoked_at" timestamp,
	"status" "session_purchase_status" DEFAULT 'pending_upload' NOT NULL,
	"payment_mode" "session_purchase_payment_mode" NOT NULL,
	"buyer_eligibility" "participant_eligibility" NOT NULL,
	"eligibility_evaluated_at" timestamp NOT NULL,
	"eligibility_snapshot" jsonb NOT NULL,
	"subtotal_amount" numeric(10, 2) NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"hold_expires_at" timestamp,
	"voucher_submitted_at" timestamp,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"expired_at" timestamp,
	"cancelled_at" timestamp,
	"no_refund_policy_version" text NOT NULL,
	"no_refund_policy_accepted_at" timestamp NOT NULL,
	"idempotency_key" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_purchases_access_token_hash_unique" UNIQUE("access_token_hash"),
	CONSTRAINT "session_purchases_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "session_purchases_identity_check" CHECK ((
        ("session_purchases"."user_id" IS NOT NULL AND "session_purchases"."guest_name" IS NULL AND "session_purchases"."guest_email" IS NULL AND "session_purchases"."guest_phone" IS NULL)
        OR
        ("session_purchases"."user_id" IS NULL
         AND "session_purchases"."guest_name" IS NOT NULL AND length(trim("session_purchases"."guest_name")) > 0
         AND "session_purchases"."guest_email" IS NOT NULL AND length(trim("session_purchases"."guest_email")) > 0
         AND "session_purchases"."guest_phone" IS NOT NULL AND length(trim("session_purchases"."guest_phone")) > 0)
      )),
	CONSTRAINT "session_purchases_amounts_valid" CHECK ("session_purchases"."subtotal_amount" >= 0 AND "session_purchases"."total_amount" >= 0 AND "session_purchases"."total_amount" <= "session_purchases"."subtotal_amount"),
	CONSTRAINT "session_purchases_free_has_no_hold" CHECK ("session_purchases"."payment_mode" <> 'free' OR ("session_purchases"."total_amount" = 0 AND "session_purchases"."hold_expires_at" IS NULL)),
	CONSTRAINT "session_purchases_paid_has_hold" CHECK ("session_purchases"."payment_mode" <> 'bank_qr' OR "session_purchases"."hold_expires_at" IS NOT NULL),
	CONSTRAINT "session_purchases_terminal_timestamps" CHECK (("session_purchases"."status" <> 'approved' OR "session_purchases"."approved_at" IS NOT NULL)
        AND ("session_purchases"."status" <> 'rejected' OR "session_purchases"."rejected_at" IS NOT NULL)
        AND ("session_purchases"."status" <> 'expired' OR "session_purchases"."expired_at" IS NOT NULL)
        AND ("session_purchases"."status" <> 'cancelled' OR "session_purchases"."cancelled_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "session_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_line_id" integer NOT NULL,
	"occurrence_id" integer NOT NULL,
	"code" text NOT NULL,
	"status" "session_ticket_status" DEFAULT 'valid' NOT NULL,
	"attendee_user_id" integer,
	"attendee_name" text NOT NULL,
	"attendee_email" text NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"cancelled_at" timestamp,
	"cancelled_reason" text,
	"cancelled_by_actor_type" "purchase_actor_type",
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_tickets_purchase_line_id_unique" UNIQUE("purchase_line_id"),
	CONSTRAINT "session_tickets_code_unique" UNIQUE("code"),
	CONSTRAINT "session_tickets_id_occurrence_id_unique" UNIQUE("id","occurrence_id"),
	CONSTRAINT "session_tickets_cancelled_consistent" CHECK ("session_tickets"."status" <> 'cancelled' OR "session_tickets"."cancelled_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "session_attendances" ADD CONSTRAINT "session_attendances_operator_user_id_users_id_fk" FOREIGN KEY ("operator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendances" ADD CONSTRAINT "session_attendances_ticket_occurrence_fk" FOREIGN KEY ("ticket_id","occurrence_id") REFERENCES "public"."session_tickets"("id","occurrence_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_purchase_events" ADD CONSTRAINT "session_purchase_events_purchase_id_session_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."session_purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_purchase_events" ADD CONSTRAINT "session_purchase_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_purchase_lines" ADD CONSTRAINT "session_purchase_lines_purchase_id_session_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."session_purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_purchases" ADD CONSTRAINT "session_purchases_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_purchases" ADD CONSTRAINT "session_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_tickets" ADD CONSTRAINT "session_tickets_attendee_user_id_users_id_fk" FOREIGN KEY ("attendee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_tickets" ADD CONSTRAINT "session_tickets_line_occurrence_fk" FOREIGN KEY ("purchase_line_id","occurrence_id") REFERENCES "public"."session_purchase_lines"("id","occurrence_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_attendances_occurrence_idx" ON "session_attendances" USING btree ("occurrence_id");--> statement-breakpoint
CREATE INDEX "session_purchase_events_purchase_created_idx" ON "session_purchase_events" USING btree ("purchase_id","created_at");--> statement-breakpoint
CREATE INDEX "session_purchase_lines_occurrence_idx" ON "session_purchase_lines" USING btree ("occurrence_id");--> statement-breakpoint
CREATE INDEX "session_purchase_lines_purchase_idx" ON "session_purchase_lines" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "session_purchases_status_hold_expires_idx" ON "session_purchases" USING btree ("status","hold_expires_at");--> statement-breakpoint
CREATE INDEX "session_purchases_user_created_idx" ON "session_purchases" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "session_purchases_program_status_idx" ON "session_purchases" USING btree ("program_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "session_tickets_occurrence_attendee_user_idx" ON "session_tickets" USING btree ("occurrence_id","attendee_user_id") WHERE "session_tickets"."status" = 'valid' AND "session_tickets"."attendee_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "session_tickets_occurrence_attendee_email_idx" ON "session_tickets" USING btree ("occurrence_id",lower("attendee_email")) WHERE "session_tickets"."status" = 'valid';--> statement-breakpoint
CREATE INDEX "session_tickets_occurrence_status_idx" ON "session_tickets" USING btree ("occurrence_id","status");--> statement-breakpoint
ALTER TABLE "session_occurrences" ADD CONSTRAINT "session_occurrences_id_session_id_unique" UNIQUE("id","session_id");