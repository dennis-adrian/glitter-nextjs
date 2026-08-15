CREATE TYPE "public"."fast_pass_activation_method" AS ENUM('qr_scan', 'on_site_sale', 'manual');--> statement-breakpoint
CREATE TYPE "public"."fast_pass_actor_type" AS ENUM('buyer', 'admin', 'pos_operator', 'system');--> statement-breakpoint
CREATE TYPE "public"."fast_pass_channel" AS ENUM('online', 'on_site');--> statement-breakpoint
CREATE TYPE "public"."fast_pass_event_type" AS ENUM('settings_updated', 'purchase_created', 'voucher_uploaded', 'voucher_replaced', 'changes_requested', 'approved', 'rejected', 'cancelled_by_buyer', 'cancelled_by_admin', 'expired', 'ticket_issued', 'holder_updated', 'ticket_activated', 'ticket_cancelled', 'pos_operator_created', 'pos_operator_revoked', 'on_site_sale', 'sale_transaction', 'cancellation_transaction', 'festival_cancelled', 'refund_created', 'refund_resolved', 'link_resent', 'link_revoked', 'notification_failed');--> statement-breakpoint
CREATE TYPE "public"."fast_pass_payment_method" AS ENUM('bank_qr', 'cash');--> statement-breakpoint
CREATE TYPE "public"."fast_pass_purchase_status" AS ENUM('pending_upload', 'under_verification', 'changes_requested', 'approved', 'rejected', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."fast_pass_refund_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TYPE "public"."fast_pass_refund_trigger" AS ENUM('festival_cancellation');--> statement-breakpoint
CREATE TYPE "public"."fast_pass_ticket_status" AS ENUM('valid', 'activated', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."fast_pass_transaction_type" AS ENUM('sale', 'cancellation', 'refund');--> statement-breakpoint
CREATE TYPE "public"."fast_pass_voucher_uploader" AS ENUM('buyer', 'admin', 'pos_operator');--> statement-breakpoint
CREATE TABLE "fast_pass_activations" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"festival_date_id" integer NOT NULL,
	"method" "fast_pass_activation_method" NOT NULL,
	"operator_user_id" integer,
	"pos_operator_id" integer,
	"wristband_issued" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fast_pass_activations_ticket_id_unique" UNIQUE("ticket_id")
);
--> statement-breakpoint
CREATE TABLE "fast_pass_day_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"festival_date_id" integer NOT NULL,
	"offering_enabled" boolean DEFAULT false NOT NULL,
	"online_sales_enabled" boolean DEFAULT false NOT NULL,
	"on_site_sales_enabled" boolean DEFAULT false NOT NULL,
	"online_sales_paused_at" timestamp,
	"on_site_sales_paused_at" timestamp,
	"price" numeric(10, 2) NOT NULL,
	"sales_start_at" timestamp,
	"sales_end_at" timestamp,
	"paid_inventory_limit" integer NOT NULL,
	"priority_capacity_limit" integer NOT NULL,
	"online_paid_allocation" integer NOT NULL,
	"on_site_paid_allocation" integer NOT NULL,
	"online_priority_allocation" integer NOT NULL,
	"on_site_priority_allocation" integer NOT NULL,
	"max_paid_passes_per_purchase" integer DEFAULT 10 NOT NULL,
	"bank_qr_image_url" text,
	"on_site_bank_qr_enabled" boolean DEFAULT true NOT NULL,
	"on_site_cash_enabled" boolean DEFAULT false NOT NULL,
	"on_site_proof_required" boolean DEFAULT true NOT NULL,
	"on_site_visitor_details_required" boolean DEFAULT false NOT NULL,
	"notify_on_sale" boolean DEFAULT false NOT NULL,
	"notify_on_cancellation" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp,
	"updated_by_user_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fast_pass_day_settings_festival_date_id_unique" UNIQUE("festival_date_id"),
	CONSTRAINT "fast_pass_day_settings_price_positive" CHECK ("fast_pass_day_settings"."price" > 0),
	CONSTRAINT "fast_pass_day_settings_limits_positive" CHECK ("fast_pass_day_settings"."paid_inventory_limit" > 0
        AND "fast_pass_day_settings"."priority_capacity_limit" > 0
        AND "fast_pass_day_settings"."online_paid_allocation" >= 0
        AND "fast_pass_day_settings"."on_site_paid_allocation" >= 0
        AND "fast_pass_day_settings"."online_priority_allocation" >= 0
        AND "fast_pass_day_settings"."on_site_priority_allocation" >= 0
        AND "fast_pass_day_settings"."max_paid_passes_per_purchase" > 0),
	CONSTRAINT "fast_pass_day_settings_allocations_within_totals" CHECK ("fast_pass_day_settings"."online_paid_allocation" + "fast_pass_day_settings"."on_site_paid_allocation" <= "fast_pass_day_settings"."paid_inventory_limit"
        AND "fast_pass_day_settings"."online_priority_allocation" + "fast_pass_day_settings"."on_site_priority_allocation" <= "fast_pass_day_settings"."priority_capacity_limit"),
	CONSTRAINT "fast_pass_day_settings_sales_window" CHECK ("fast_pass_day_settings"."sales_start_at" IS NULL OR "fast_pass_day_settings"."sales_end_at" IS NULL OR "fast_pass_day_settings"."sales_end_at" >= "fast_pass_day_settings"."sales_start_at"),
	CONSTRAINT "fast_pass_day_settings_onsite_payment_method" CHECK (NOT "fast_pass_day_settings"."on_site_sales_enabled"
        OR "fast_pass_day_settings"."on_site_bank_qr_enabled"
        OR "fast_pass_day_settings"."on_site_cash_enabled")
);
--> statement-breakpoint
CREATE TABLE "fast_pass_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_id" integer,
	"settings_id" integer,
	"actor_type" "fast_pass_actor_type" NOT NULL,
	"actor_user_id" integer,
	"pos_operator_id" integer,
	"event_type" "fast_pass_event_type" NOT NULL,
	"from_status" "fast_pass_purchase_status",
	"to_status" "fast_pass_purchase_status",
	"reason" text,
	"changes" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fast_pass_events_scope" CHECK ("fast_pass_events"."purchase_id" IS NOT NULL OR "fast_pass_events"."settings_id" IS NOT NULL),
	CONSTRAINT "fast_pass_events_admin_needs_reason" CHECK ("fast_pass_events"."actor_type" <> 'admin'
        OR "fast_pass_events"."event_type" IN ('approved', 'settings_updated', 'ticket_issued', 'ticket_activated', 'on_site_sale', 'sale_transaction', 'link_resent', 'pos_operator_created', 'voucher_uploaded', 'voucher_replaced')
        OR ("fast_pass_events"."reason" IS NOT NULL AND length(trim("fast_pass_events"."reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "fast_pass_notification_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"settings_id" integer NOT NULL,
	"email" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fast_pass_notification_recipients_email_present" CHECK (length(trim("fast_pass_notification_recipients"."email")) > 0)
);
--> statement-breakpoint
CREATE TABLE "fast_pass_pos_operators" (
	"id" serial PRIMARY KEY NOT NULL,
	"settings_id" integer NOT NULL,
	"display_name" text NOT NULL,
	"access_token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_by_user_id" integer,
	"last_used_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fast_pass_pos_operators_access_token_hash_unique" UNIQUE("access_token_hash"),
	CONSTRAINT "fast_pass_pos_operators_display_name_present" CHECK (length(trim("fast_pass_pos_operators"."display_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "fast_pass_purchase_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_id" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"pricing_snapshot" jsonb NOT NULL,
	"holder_first_name" text,
	"holder_last_name" text,
	"holder_email" text,
	"holder_phone" text,
	"holder_gender" "gender",
	"holder_birthdate" date,
	"responsible_child_count" integer DEFAULT 0 NOT NULL,
	"visitor_id" integer,
	"festival_ticket_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fast_pass_purchase_lines_price_non_negative" CHECK ("fast_pass_purchase_lines"."unit_price" >= 0),
	CONSTRAINT "fast_pass_purchase_lines_child_count" CHECK ("fast_pass_purchase_lines"."responsible_child_count" >= 0 AND "fast_pass_purchase_lines"."responsible_child_count" <= 5)
);
--> statement-breakpoint
CREATE TABLE "fast_pass_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"settings_id" integer NOT NULL,
	"festival_date_id" integer NOT NULL,
	"channel" "fast_pass_channel" NOT NULL,
	"status" "fast_pass_purchase_status" DEFAULT 'pending_upload' NOT NULL,
	"payment_method" "fast_pass_payment_method" NOT NULL,
	"buyer_name" text,
	"buyer_email" text,
	"buyer_phone" text,
	"access_token_hash" text,
	"access_token_revoked_at" timestamp,
	"subtotal_amount" numeric(10, 2) NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"hold_expires_at" timestamp,
	"correction_expires_at" timestamp,
	"voucher_submitted_at" timestamp,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"expired_at" timestamp,
	"cancelled_at" timestamp,
	"policy_version" text,
	"policy_accepted_at" timestamp,
	"pos_operator_id" integer,
	"created_by_user_id" integer,
	"on_site_proof_required_snapshot" boolean,
	"on_site_visitor_details_required_snapshot" boolean,
	"allocation_restored" boolean,
	"idempotency_key" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fast_pass_purchases_access_token_hash_unique" UNIQUE("access_token_hash"),
	CONSTRAINT "fast_pass_purchases_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "fast_pass_purchases_amounts_valid" CHECK ("fast_pass_purchases"."subtotal_amount" >= 0 AND "fast_pass_purchases"."total_amount" >= 0 AND "fast_pass_purchases"."total_amount" = "fast_pass_purchases"."subtotal_amount"),
	CONSTRAINT "fast_pass_purchases_online_identity" CHECK ("fast_pass_purchases"."channel" <> 'online' OR (
        "fast_pass_purchases"."buyer_name" IS NOT NULL AND length(trim("fast_pass_purchases"."buyer_name")) > 0
        AND "fast_pass_purchases"."buyer_email" IS NOT NULL AND length(trim("fast_pass_purchases"."buyer_email")) > 0
        AND "fast_pass_purchases"."buyer_phone" IS NOT NULL AND length(trim("fast_pass_purchases"."buyer_phone")) > 0
        AND "fast_pass_purchases"."access_token_hash" IS NOT NULL
        AND "fast_pass_purchases"."policy_version" IS NOT NULL AND length(trim("fast_pass_purchases"."policy_version")) > 0
        AND "fast_pass_purchases"."policy_accepted_at" IS NOT NULL
        AND "fast_pass_purchases"."hold_expires_at" IS NOT NULL
        AND "fast_pass_purchases"."pos_operator_id" IS NULL
        AND "fast_pass_purchases"."created_by_user_id" IS NULL
      )),
	CONSTRAINT "fast_pass_purchases_onsite_identity" CHECK ("fast_pass_purchases"."channel" <> 'on_site' OR (
        "fast_pass_purchases"."access_token_hash" IS NULL
        AND "fast_pass_purchases"."status" IN ('approved', 'cancelled')
        AND (
          ("fast_pass_purchases"."pos_operator_id" IS NOT NULL AND "fast_pass_purchases"."created_by_user_id" IS NULL)
          OR ("fast_pass_purchases"."pos_operator_id" IS NULL AND "fast_pass_purchases"."created_by_user_id" IS NOT NULL)
        )
      )),
	CONSTRAINT "fast_pass_purchases_terminal_timestamps" CHECK (("fast_pass_purchases"."status" <> 'approved' OR "fast_pass_purchases"."approved_at" IS NOT NULL)
        AND ("fast_pass_purchases"."status" <> 'rejected' OR "fast_pass_purchases"."rejected_at" IS NOT NULL)
        AND ("fast_pass_purchases"."status" <> 'expired' OR "fast_pass_purchases"."expired_at" IS NOT NULL)
        AND ("fast_pass_purchases"."status" <> 'cancelled' OR "fast_pass_purchases"."cancelled_at" IS NOT NULL)),
	CONSTRAINT "fast_pass_purchases_online_payment_method" CHECK ("fast_pass_purchases"."channel" <> 'online' OR "fast_pass_purchases"."payment_method" = 'bank_qr')
);
--> statement-breakpoint
CREATE TABLE "fast_pass_refunds" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_id" integer NOT NULL,
	"sale_transaction_id" integer NOT NULL,
	"trigger" "fast_pass_refund_trigger" DEFAULT 'festival_cancellation' NOT NULL,
	"status" "fast_pass_refund_status" DEFAULT 'pending' NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"payment_method" "fast_pass_payment_method" NOT NULL,
	"resolution_notes" text,
	"resolution_reference" text,
	"created_by_user_id" integer,
	"resolved_by_user_id" integer,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fast_pass_refunds_amount_positive" CHECK ("fast_pass_refunds"."amount" > 0),
	CONSTRAINT "fast_pass_refunds_paid_consistent" CHECK ("fast_pass_refunds"."status" <> 'paid' OR (
        "fast_pass_refunds"."resolved_at" IS NOT NULL
        AND "fast_pass_refunds"."resolved_by_user_id" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "fast_pass_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_line_id" integer NOT NULL,
	"festival_date_id" integer NOT NULL,
	"code" text NOT NULL,
	"status" "fast_pass_ticket_status" DEFAULT 'valid' NOT NULL,
	"holder_first_name" text,
	"holder_last_name" text,
	"holder_email" text,
	"responsible_child_count" integer DEFAULT 0 NOT NULL,
	"festival_ticket_id" integer,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp,
	"cancelled_at" timestamp,
	"cancelled_reason" text,
	"cancelled_by_user_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fast_pass_tickets_purchase_line_id_unique" UNIQUE("purchase_line_id"),
	CONSTRAINT "fast_pass_tickets_code_unique" UNIQUE("code"),
	CONSTRAINT "fast_pass_tickets_child_count" CHECK ("fast_pass_tickets"."responsible_child_count" >= 0 AND "fast_pass_tickets"."responsible_child_count" <= 5),
	CONSTRAINT "fast_pass_tickets_activated_consistent" CHECK ("fast_pass_tickets"."status" <> 'activated' OR "fast_pass_tickets"."activated_at" IS NOT NULL),
	CONSTRAINT "fast_pass_tickets_cancelled_consistent" CHECK ("fast_pass_tickets"."status" <> 'cancelled' OR "fast_pass_tickets"."cancelled_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "fast_pass_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_id" integer NOT NULL,
	"type" "fast_pass_transaction_type" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"payment_method" "fast_pass_payment_method" NOT NULL,
	"related_transaction_id" integer,
	"pos_operator_id" integer,
	"actor_user_id" integer,
	"reason" text,
	"cash_received_amount" numeric(10, 2),
	"cash_change_amount" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fast_pass_transactions_amount_direction" CHECK (("fast_pass_transactions"."type" = 'sale' AND "fast_pass_transactions"."amount" > 0)
        OR ("fast_pass_transactions"."type" IN ('cancellation', 'refund') AND "fast_pass_transactions"."amount" < 0)),
	CONSTRAINT "fast_pass_transactions_reversal_needs_reason" CHECK ("fast_pass_transactions"."type" = 'sale' OR ("fast_pass_transactions"."reason" IS NOT NULL AND length(trim("fast_pass_transactions"."reason")) > 0)),
	CONSTRAINT "fast_pass_transactions_reversal_needs_related" CHECK ("fast_pass_transactions"."type" = 'sale' OR "fast_pass_transactions"."related_transaction_id" IS NOT NULL),
	CONSTRAINT "fast_pass_transactions_cash_metadata" CHECK (("fast_pass_transactions"."payment_method" <> 'cash')
        OR ("fast_pass_transactions"."type" <> 'sale')
        OR (
          "fast_pass_transactions"."cash_received_amount" IS NOT NULL
          AND "fast_pass_transactions"."cash_change_amount" IS NOT NULL
          AND "fast_pass_transactions"."cash_received_amount" >= "fast_pass_transactions"."amount"
          AND "fast_pass_transactions"."cash_change_amount" = "fast_pass_transactions"."cash_received_amount" - "fast_pass_transactions"."amount"
        ))
);
--> statement-breakpoint
CREATE TABLE "fast_pass_vouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_id" integer NOT NULL,
	"version" integer NOT NULL,
	"file_url" text NOT NULL,
	"uploaded_via" "fast_pass_voucher_uploader" NOT NULL,
	"uploaded_by_user_id" integer,
	"uploaded_by_pos_operator_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fast_pass_vouchers_purchase_version_unique" UNIQUE("purchase_id","version"),
	CONSTRAINT "fast_pass_vouchers_version_positive" CHECK ("fast_pass_vouchers"."version" >= 1),
	CONSTRAINT "fast_pass_vouchers_file_present" CHECK (length(trim("fast_pass_vouchers"."file_url")) > 0)
);
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "created_by_fast_pass" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "retired_at" timestamp;--> statement-breakpoint
ALTER TABLE "fast_pass_activations" ADD CONSTRAINT "fast_pass_activations_festival_date_id_festival_dates_id_fk" FOREIGN KEY ("festival_date_id") REFERENCES "public"."festival_dates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_activations" ADD CONSTRAINT "fast_pass_activations_operator_user_id_users_id_fk" FOREIGN KEY ("operator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_activations" ADD CONSTRAINT "fast_pass_activations_pos_operator_id_fast_pass_pos_operators_id_fk" FOREIGN KEY ("pos_operator_id") REFERENCES "public"."fast_pass_pos_operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_activations" ADD CONSTRAINT "fast_pass_activations_ticket_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."fast_pass_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_day_settings" ADD CONSTRAINT "fast_pass_day_settings_festival_date_id_festival_dates_id_fk" FOREIGN KEY ("festival_date_id") REFERENCES "public"."festival_dates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_day_settings" ADD CONSTRAINT "fast_pass_day_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_events" ADD CONSTRAINT "fast_pass_events_purchase_id_fast_pass_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."fast_pass_purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_events" ADD CONSTRAINT "fast_pass_events_settings_id_fast_pass_day_settings_id_fk" FOREIGN KEY ("settings_id") REFERENCES "public"."fast_pass_day_settings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_events" ADD CONSTRAINT "fast_pass_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_events" ADD CONSTRAINT "fast_pass_events_pos_operator_id_fast_pass_pos_operators_id_fk" FOREIGN KEY ("pos_operator_id") REFERENCES "public"."fast_pass_pos_operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_notification_recipients" ADD CONSTRAINT "fast_pass_notification_recipients_settings_id_fast_pass_day_settings_id_fk" FOREIGN KEY ("settings_id") REFERENCES "public"."fast_pass_day_settings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_pos_operators" ADD CONSTRAINT "fast_pass_pos_operators_settings_id_fast_pass_day_settings_id_fk" FOREIGN KEY ("settings_id") REFERENCES "public"."fast_pass_day_settings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_pos_operators" ADD CONSTRAINT "fast_pass_pos_operators_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_purchase_lines" ADD CONSTRAINT "fast_pass_purchase_lines_purchase_id_fast_pass_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."fast_pass_purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_purchase_lines" ADD CONSTRAINT "fast_pass_purchase_lines_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_purchase_lines" ADD CONSTRAINT "fast_pass_purchase_lines_festival_ticket_id_tickets_id_fk" FOREIGN KEY ("festival_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_purchases" ADD CONSTRAINT "fast_pass_purchases_settings_id_fast_pass_day_settings_id_fk" FOREIGN KEY ("settings_id") REFERENCES "public"."fast_pass_day_settings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_purchases" ADD CONSTRAINT "fast_pass_purchases_festival_date_id_festival_dates_id_fk" FOREIGN KEY ("festival_date_id") REFERENCES "public"."festival_dates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_purchases" ADD CONSTRAINT "fast_pass_purchases_pos_operator_id_fast_pass_pos_operators_id_fk" FOREIGN KEY ("pos_operator_id") REFERENCES "public"."fast_pass_pos_operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_purchases" ADD CONSTRAINT "fast_pass_purchases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_refunds" ADD CONSTRAINT "fast_pass_refunds_purchase_id_fast_pass_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."fast_pass_purchases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_refunds" ADD CONSTRAINT "fast_pass_refunds_sale_transaction_id_fast_pass_transactions_id_fk" FOREIGN KEY ("sale_transaction_id") REFERENCES "public"."fast_pass_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_refunds" ADD CONSTRAINT "fast_pass_refunds_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_refunds" ADD CONSTRAINT "fast_pass_refunds_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_tickets" ADD CONSTRAINT "fast_pass_tickets_festival_date_id_festival_dates_id_fk" FOREIGN KEY ("festival_date_id") REFERENCES "public"."festival_dates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_tickets" ADD CONSTRAINT "fast_pass_tickets_festival_ticket_id_tickets_id_fk" FOREIGN KEY ("festival_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_tickets" ADD CONSTRAINT "fast_pass_tickets_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_tickets" ADD CONSTRAINT "fast_pass_tickets_purchase_line_fk" FOREIGN KEY ("purchase_line_id") REFERENCES "public"."fast_pass_purchase_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_transactions" ADD CONSTRAINT "fast_pass_transactions_purchase_id_fast_pass_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."fast_pass_purchases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_transactions" ADD CONSTRAINT "fast_pass_transactions_pos_operator_id_fast_pass_pos_operators_id_fk" FOREIGN KEY ("pos_operator_id") REFERENCES "public"."fast_pass_pos_operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_transactions" ADD CONSTRAINT "fast_pass_transactions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_transactions" ADD CONSTRAINT "fast_pass_transactions_related_fk" FOREIGN KEY ("related_transaction_id") REFERENCES "public"."fast_pass_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_vouchers" ADD CONSTRAINT "fast_pass_vouchers_purchase_id_fast_pass_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."fast_pass_purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_vouchers" ADD CONSTRAINT "fast_pass_vouchers_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fast_pass_vouchers" ADD CONSTRAINT "fast_pass_vouchers_uploaded_by_pos_operator_id_fast_pass_pos_operators_id_fk" FOREIGN KEY ("uploaded_by_pos_operator_id") REFERENCES "public"."fast_pass_pos_operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fast_pass_activations_festival_date_idx" ON "fast_pass_activations" USING btree ("festival_date_id");--> statement-breakpoint
CREATE INDEX "fast_pass_events_purchase_created_idx" ON "fast_pass_events" USING btree ("purchase_id","created_at");--> statement-breakpoint
CREATE INDEX "fast_pass_events_settings_created_idx" ON "fast_pass_events" USING btree ("settings_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fast_pass_notification_recipients_settings_email_uidx" ON "fast_pass_notification_recipients" USING btree ("settings_id",lower("email"));--> statement-breakpoint
CREATE INDEX "fast_pass_pos_operators_settings_idx" ON "fast_pass_pos_operators" USING btree ("settings_id");--> statement-breakpoint
CREATE INDEX "fast_pass_purchase_lines_purchase_idx" ON "fast_pass_purchase_lines" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "fast_pass_purchases_settings_status_idx" ON "fast_pass_purchases" USING btree ("settings_id","status");--> statement-breakpoint
CREATE INDEX "fast_pass_purchases_festival_date_status_idx" ON "fast_pass_purchases" USING btree ("festival_date_id","status");--> statement-breakpoint
CREATE INDEX "fast_pass_purchases_status_hold_expires_idx" ON "fast_pass_purchases" USING btree ("status","hold_expires_at");--> statement-breakpoint
CREATE INDEX "fast_pass_purchases_status_correction_expires_idx" ON "fast_pass_purchases" USING btree ("status","correction_expires_at");--> statement-breakpoint
CREATE INDEX "fast_pass_refunds_status_idx" ON "fast_pass_refunds" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "fast_pass_refunds_sale_trigger_uidx" ON "fast_pass_refunds" USING btree ("sale_transaction_id","trigger");--> statement-breakpoint
CREATE INDEX "fast_pass_tickets_festival_date_status_idx" ON "fast_pass_tickets" USING btree ("festival_date_id","status");--> statement-breakpoint
CREATE INDEX "fast_pass_transactions_purchase_idx" ON "fast_pass_transactions" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "fast_pass_transactions_type_created_idx" ON "fast_pass_transactions" USING btree ("type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fast_pass_transactions_one_sale_per_purchase_uidx" ON "fast_pass_transactions" USING btree ("purchase_id") WHERE "fast_pass_transactions"."type" = 'sale';--> statement-breakpoint
CREATE UNIQUE INDEX "fast_pass_transactions_one_cancellation_per_sale_uidx" ON "fast_pass_transactions" USING btree ("related_transaction_id") WHERE "fast_pass_transactions"."type" = 'cancellation';--> statement-breakpoint
CREATE INDEX "visitors_email_lower_idx" ON "visitors" USING btree (lower("email"));--> statement-breakpoint
DO $migration$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "tickets"
		WHERE "ticket_number" IS NOT NULL
		GROUP BY "festival_id", "ticket_number"
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'tickets contains duplicate festival_id/ticket_number pairs; resolve them before applying 0227';
	END IF;
END
$migration$;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_festival_id_ticket_number_unique" UNIQUE("festival_id","ticket_number");
