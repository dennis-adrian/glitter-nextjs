DROP INDEX "invoice_settlement_submissions_idempotency_key_unique";--> statement-breakpoint
DROP INDEX "payments_idempotency_key_unique";--> statement-breakpoint
DROP INDEX "stand_reservation_events_idempotency_key_unique";--> statement-breakpoint
UPDATE "payments" AS p
SET "idempotency_key" = NULL, "updated_at" = now()
WHERE p."idempotency_key" IS NOT NULL
  AND p."id" NOT IN (
    SELECT DISTINCT ON ("invoice_id", "idempotency_key") "id"
    FROM "payments"
    WHERE "idempotency_key" IS NOT NULL
    ORDER BY "invoice_id", "idempotency_key", "created_at" DESC, "id" DESC
  );--> statement-breakpoint
UPDATE "invoice_settlement_submissions" AS s
SET "idempotency_key" = NULL, "updated_at" = now()
WHERE s."idempotency_key" IS NOT NULL
  AND s."id" NOT IN (
    SELECT DISTINCT ON ("invoice_id", "idempotency_key") "id"
    FROM "invoice_settlement_submissions"
    WHERE "idempotency_key" IS NOT NULL
    ORDER BY "invoice_id", "idempotency_key", "created_at" DESC, "id" DESC
  );--> statement-breakpoint
UPDATE "stand_reservation_events" AS e
SET "idempotency_key" = NULL
WHERE e."idempotency_key" IS NOT NULL
  AND e."id" NOT IN (
    SELECT DISTINCT ON ("reservation_id", "idempotency_key") "id"
    FROM "stand_reservation_events"
    WHERE "idempotency_key" IS NOT NULL
    ORDER BY "reservation_id", "idempotency_key", "created_at" DESC, "id" DESC
  );--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_settlement_submissions_invoice_id_idempotency_key_unique" ON "invoice_settlement_submissions" USING btree ("invoice_id","idempotency_key") WHERE "invoice_settlement_submissions"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_invoice_id_idempotency_key_unique" ON "payments" USING btree ("invoice_id","idempotency_key") WHERE "payments"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stand_reservation_events_reservation_id_idempotency_key_unique" ON "stand_reservation_events" USING btree ("reservation_id","idempotency_key") WHERE "stand_reservation_events"."idempotency_key" IS NOT NULL;