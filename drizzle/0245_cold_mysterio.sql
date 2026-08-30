CREATE TYPE "public"."reservation_notification_job_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."stand_reservation_event_type" AS ENUM('created', 'confirmed', 'rejected', 'status_changed', 'payment_submitted', 'deadline_extended');--> statement-breakpoint
ALTER TYPE "public"."reservation_source" ADD VALUE 'legacy_unknown';--> statement-breakpoint
CREATE TABLE "invoice_settlement_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"payment_id" integer,
	"voucher_url" text NOT NULL,
	"file_key" text,
	"uploaded_by_user_id" integer,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_notification_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"deduplication_key" text NOT NULL,
	"user_id" integer,
	"reservation_id" integer,
	"notification_kind" text NOT NULL,
	"recipient_email" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "reservation_notification_job_status" DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stand_reservation_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"reservation_id" integer NOT NULL,
	"actor_user_id" integer,
	"event_type" "stand_reservation_event_type" NOT NULL,
	"from_status" "reservation_status",
	"to_status" "reservation_status",
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discount_codes" ALTER COLUMN "discount_value" SET DATA TYPE numeric(12, 2) USING round("discount_value"::numeric, 2);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "original_amount" SET DATA TYPE numeric(12, 2) USING round("original_amount"::numeric, 2);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "discount_amount" SET DATA TYPE numeric(12, 2) USING round("discount_amount"::numeric, 2);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "amount" SET DATA TYPE numeric(12, 2) USING round("amount"::numeric, 2);--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "amount" SET DATA TYPE numeric(12, 2) USING round("amount"::numeric, 2);--> statement-breakpoint
ALTER TABLE "stands" ALTER COLUMN "price" SET DATA TYPE numeric(12, 2) USING round("price"::numeric, 2);--> statement-breakpoint
ALTER TABLE "festivals" ADD COLUMN "reservation_hold_minutes" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "due_at" timestamp;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "file_key" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "uploaded_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "stand_holds" ADD COLUMN "price_amount_snapshot" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "stand_holds" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "stand_reservations" ADD COLUMN "owner_user_id" integer;--> statement-breakpoint
ALTER TABLE "stand_reservations" ADD COLUMN "price_amount_snapshot" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "stand_reservations" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "invoice_settlement_submissions" ADD CONSTRAINT "invoice_settlement_submissions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_settlement_submissions" ADD CONSTRAINT "invoice_settlement_submissions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_settlement_submissions" ADD CONSTRAINT "invoice_settlement_submissions_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_notification_jobs" ADD CONSTRAINT "reservation_notification_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_notification_jobs" ADD CONSTRAINT "reservation_notification_jobs_reservation_id_stand_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."stand_reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stand_reservation_events" ADD CONSTRAINT "stand_reservation_events_reservation_id_stand_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."stand_reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stand_reservation_events" ADD CONSTRAINT "stand_reservation_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_settlement_submissions_invoice_id_idx" ON "invoice_settlement_submissions" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_settlement_submissions_idempotency_key_idx" ON "invoice_settlement_submissions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_notification_jobs_deduplication_key_unique" ON "reservation_notification_jobs" USING btree ("deduplication_key");--> statement-breakpoint
CREATE INDEX "reservation_notification_jobs_status_next_attempt_idx" ON "reservation_notification_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "stand_reservation_events_reservation_id_created_at_idx" ON "stand_reservation_events" USING btree ("reservation_id","created_at");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stand_reservations" ADD CONSTRAINT "stand_reservations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_invoice_id_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_idempotency_key_idx" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "stand_holds_idempotency_key_idx" ON "stand_holds" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "stand_reservations_live_stand_idx" ON "stand_reservations" USING btree ("stand_id");--> statement-breakpoint
CREATE INDEX "stand_reservations_owner_user_id_idx" ON "stand_reservations" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "stand_reservations_idempotency_key_idx" ON "stand_reservations" USING btree ("idempotency_key");--> statement-breakpoint
ALTER TABLE "festivals" ADD CONSTRAINT "festivals_reservation_hold_minutes_range" CHECK ("festivals"."reservation_hold_minutes" >= 1 AND "festivals"."reservation_hold_minutes" <= 30);