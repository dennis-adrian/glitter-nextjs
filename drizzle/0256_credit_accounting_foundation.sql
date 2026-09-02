CREATE TYPE "public"."credit_hold_purpose" AS ENUM('full_table_access');--> statement-breakpoint
CREATE TYPE "public"."credit_hold_status" AS ENUM('active', 'captured', 'released', 'expired');--> statement-breakpoint
CREATE TYPE "public"."credit_ledger_entry_type" AS ENUM('top_up', 'spend', 'reversal', 'admin_grant', 'admin_adjustment');--> statement-breakpoint
CREATE TYPE "public"."credit_top_up_intended_use_type" AS ENUM('feature', 'invoice', 'debt');--> statement-breakpoint
CREATE TYPE "public"."credit_top_up_status" AS ENUM('awaiting_voucher', 'under_review', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."reservation_feature_action_status" AS ENUM('active', 'fulfilled', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reservation_feature_action_type" AS ENUM('full_table_access', 'late_partner', 'reservation_release');--> statement-breakpoint
CREATE TABLE "credit_accounts" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"cached_balance" numeric(12, 2) DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_accounts_version_nonnegative" CHECK ("credit_accounts"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_holds" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"festival_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"purpose" "credit_hold_purpose" NOT NULL,
	"status" "credit_hold_status" DEFAULT 'active' NOT NULL,
	"feature_action_id" integer NOT NULL,
	"expires_at" timestamp,
	"idempotency_key" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_holds_amount_positive" CHECK ("credit_holds"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "credit_ledger_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"type" "credit_ledger_entry_type" NOT NULL,
	"status" text DEFAULT 'posted' NOT NULL,
	"top_up_id" integer,
	"feature_action_id" integer,
	"reverses_entry_id" integer,
	"idempotency_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_entries_amount_nonzero" CHECK ("credit_ledger_entries"."amount" <> 0),
	CONSTRAINT "credit_ledger_entries_posted_only" CHECK ("credit_ledger_entries"."status" = 'posted')
);
--> statement-breakpoint
CREATE TABLE "credit_top_ups" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" "credit_top_up_status" DEFAULT 'awaiting_voucher' NOT NULL,
	"intended_use_type" "credit_top_up_intended_use_type" NOT NULL,
	"intended_use_id" integer,
	"upload_deadline_at" timestamp NOT NULL,
	"voucher_url" text,
	"file_key" text,
	"submitted_at" timestamp,
	"reviewed_by_user_id" integer,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"idempotency_key" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_top_ups_amount_positive" CHECK ("credit_top_ups"."amount" > 0),
	CONSTRAINT "credit_top_ups_deadline_after_created" CHECK ("credit_top_ups"."upload_deadline_at" > "credit_top_ups"."created_at")
);
--> statement-breakpoint
CREATE TABLE "invoice_credit_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"ledger_entry_id" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_credit_allocations_amount_positive" CHECK ("invoice_credit_allocations"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "reservation_feature_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"festival_id" integer NOT NULL,
	"reservation_id" integer,
	"owner_user_id" integer NOT NULL,
	"type" "reservation_feature_action_type" NOT NULL,
	"status" "reservation_feature_action_status" DEFAULT 'active' NOT NULL,
	"feature_price_snapshot" numeric(12, 2) NOT NULL,
	"target_partner_user_id" integer,
	"individual_price_snapshot" numeric(12, 2),
	"shared_price_snapshot" numeric(12, 2),
	"idempotency_key" text,
	"failure_code" text,
	"fulfilled_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_feature_actions_feature_price_nonnegative" CHECK ("reservation_feature_actions"."feature_price_snapshot" >= 0)
);
--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_holds" ADD CONSTRAINT "credit_holds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_holds" ADD CONSTRAINT "credit_holds_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_holds" ADD CONSTRAINT "credit_holds_feature_action_id_reservation_feature_actions_id_fk" FOREIGN KEY ("feature_action_id") REFERENCES "public"."reservation_feature_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_top_up_id_credit_top_ups_id_fk" FOREIGN KEY ("top_up_id") REFERENCES "public"."credit_top_ups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_feature_action_id_reservation_feature_actions_id_fk" FOREIGN KEY ("feature_action_id") REFERENCES "public"."reservation_feature_actions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_reverses_entry_id_credit_ledger_entries_id_fk" FOREIGN KEY ("reverses_entry_id") REFERENCES "public"."credit_ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_top_ups" ADD CONSTRAINT "credit_top_ups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_top_ups" ADD CONSTRAINT "credit_top_ups_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_credit_allocations" ADD CONSTRAINT "invoice_credit_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_credit_allocations" ADD CONSTRAINT "invoice_credit_allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_credit_allocations" ADD CONSTRAINT "invoice_credit_allocations_ledger_entry_id_credit_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."credit_ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_feature_actions" ADD CONSTRAINT "reservation_feature_actions_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_feature_actions" ADD CONSTRAINT "reservation_feature_actions_reservation_id_stand_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."stand_reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_feature_actions" ADD CONSTRAINT "reservation_feature_actions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_feature_actions" ADD CONSTRAINT "reservation_feature_actions_target_partner_user_id_users_id_fk" FOREIGN KEY ("target_partner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_holds_feature_action_id_unique" ON "credit_holds" USING btree ("feature_action_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_holds_idempotency_key_unique" ON "credit_holds" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "credit_holds_user_status_idx" ON "credit_holds" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_entries_idempotency_key_unique" ON "credit_ledger_entries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_entries_top_up_issue_unique" ON "credit_ledger_entries" USING btree ("top_up_id") WHERE "credit_ledger_entries"."type" = 'top_up';--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_entries_top_up_reversal_unique" ON "credit_ledger_entries" USING btree ("top_up_id") WHERE "credit_ledger_entries"."type" = 'reversal';--> statement-breakpoint
CREATE INDEX "credit_ledger_entries_user_created_idx" ON "credit_ledger_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_top_ups_idempotency_key_unique" ON "credit_top_ups" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_top_ups_file_key_unique" ON "credit_top_ups" USING btree ("file_key") WHERE "credit_top_ups"."file_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "credit_top_ups_user_status_idx" ON "credit_top_ups" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_credit_allocations_ledger_entry_id_unique" ON "invoice_credit_allocations" USING btree ("ledger_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_credit_allocations_idempotency_key_unique" ON "invoice_credit_allocations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "invoice_credit_allocations_invoice_id_idx" ON "invoice_credit_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "reservation_feature_actions_owner_festival_idx" ON "reservation_feature_actions" USING btree ("owner_user_id","festival_id");--> statement-breakpoint
CREATE INDEX "reservation_feature_actions_reservation_id_idx" ON "reservation_feature_actions" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_feature_actions_idempotency_key_unique" ON "reservation_feature_actions" USING btree ("idempotency_key") WHERE "reservation_feature_actions"."idempotency_key" IS NOT NULL;