CREATE TYPE "public"."settlement_submission_kind" AS ENUM('payment_proof', 'zero_value_entitlement');--> statement-breakpoint
CREATE TYPE "public"."settlement_submission_status" AS ENUM('submitted', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."stand_reservation_event_type" ADD VALUE 'settlement_submitted';--> statement-breakpoint
ALTER TYPE "public"."stand_reservation_event_type" ADD VALUE 'settlement_approved';--> statement-breakpoint
ALTER TYPE "public"."stand_reservation_event_type" ADD VALUE 'settlement_rejected';--> statement-breakpoint
ALTER TYPE "public"."stand_reservation_event_type" ADD VALUE 'accepted';--> statement-breakpoint
ALTER TYPE "public"."stand_reservation_event_type" ADD VALUE 'deleted';--> statement-breakpoint
ALTER TABLE "invoice_settlement_submissions" ALTER COLUMN "voucher_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_settlement_submissions" ADD COLUMN "kind" "settlement_submission_kind" DEFAULT 'payment_proof' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_settlement_submissions" ADD COLUMN "status" "settlement_submission_status" DEFAULT 'submitted' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_settlement_submissions" ADD COLUMN "reviewed_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "invoice_settlement_submissions" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoice_settlement_submissions" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "invoice_settlement_submissions" ADD COLUMN "evidence_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "invoice_settlement_submissions" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "stand_reservation_events" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "invoice_settlement_submissions" ADD CONSTRAINT "invoice_settlement_submissions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "invoice_settlement_submissions" AS s
SET "status" = 'rejected', "updated_at" = now()
WHERE s."id" NOT IN (
  SELECT DISTINCT ON ("invoice_id") "id"
  FROM "invoice_settlement_submissions"
  ORDER BY "invoice_id", "created_at" DESC, "id" DESC
);--> statement-breakpoint
UPDATE "invoice_settlement_submissions" AS s
SET "status" = 'approved', "reviewed_at" = now(), "updated_at" = now()
FROM "invoices" AS i
WHERE i."id" = s."invoice_id"
  AND i."status" = 'paid'
  AND s."status" = 'submitted';--> statement-breakpoint
UPDATE "invoice_settlement_submissions"
SET "kind" = 'zero_value_entitlement'
WHERE "payment_id" IS NULL
  AND "kind" = 'payment_proof';--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_settlement_submissions_one_submitted" ON "invoice_settlement_submissions" USING btree ("invoice_id") WHERE "invoice_settlement_submissions"."status" = 'submitted';--> statement-breakpoint
UPDATE "payments" AS p
SET "file_key" = NULL, "updated_at" = now()
WHERE p."file_key" IS NOT NULL
  AND p."id" NOT IN (
    SELECT DISTINCT ON ("file_key") "id"
    FROM "payments"
    WHERE "file_key" IS NOT NULL
    ORDER BY "file_key", "created_at" DESC, "id" DESC
  );--> statement-breakpoint
CREATE UNIQUE INDEX "payments_file_key_unique" ON "payments" USING btree ("file_key") WHERE "payments"."file_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "stand_holds_expires_at_idx" ON "stand_holds" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stand_reservation_events_idempotency_key_unique" ON "stand_reservation_events" USING btree ("idempotency_key") WHERE "stand_reservation_events"."idempotency_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_settlement_submissions" ADD CONSTRAINT "invoice_settlement_submissions_kind_payment_id" CHECK (("invoice_settlement_submissions"."kind" = 'payment_proof' AND "invoice_settlement_submissions"."payment_id" IS NOT NULL) OR ("invoice_settlement_submissions"."kind" = 'zero_value_entitlement' AND "invoice_settlement_submissions"."payment_id" IS NULL));--> statement-breakpoint
UPDATE "stand_holds"
SET "expires_at" = "created_at" + interval '1 second', "updated_at" = now()
WHERE "expires_at" <= "created_at";--> statement-breakpoint
ALTER TABLE "stand_holds" ADD CONSTRAINT "stand_holds_expires_after_created" CHECK ("stand_holds"."expires_at" > "stand_holds"."created_at");