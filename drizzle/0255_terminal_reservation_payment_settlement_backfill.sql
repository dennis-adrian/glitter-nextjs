-- A paid invoice records a historically approved payment even when its
-- reservation later becomes terminal. Backfill that lifecycle history without
-- changing the current reservation or invoice status.
WITH legacy_terminal_payments AS (
  SELECT DISTINCT ON (p."invoice_id")
    p."id",
    p."invoice_id",
    p."voucher_url",
    p."file_key",
    p."uploaded_by_user_id",
    p."date",
    p."updated_at",
    i."reservation_id",
    r."status" AS "reservation_status"
  FROM "payments" AS p
  INNER JOIN "invoices" AS i ON i."id" = p."invoice_id"
  INNER JOIN "stand_reservations" AS r ON r."id" = i."reservation_id"
  WHERE i."status" = 'paid'
    AND r."status" IN ('rejected', 'cancelled', 'released')
    AND NOT EXISTS (
      SELECT 1
      FROM "invoice_settlement_submissions" AS s
      WHERE s."invoice_id" = i."id"
        AND s."kind" = 'payment_proof'
    )
  ORDER BY p."invoice_id", p."created_at" DESC, p."id" DESC
)
INSERT INTO "invoice_settlement_submissions" (
  "invoice_id",
  "payment_id",
  "voucher_url",
  "file_key",
  "uploaded_by_user_id",
  "kind",
  "status",
  "reviewed_at",
  "evidence_snapshot",
  "idempotency_key",
  "created_at",
  "updated_at"
)
SELECT
  p."invoice_id",
  p."id",
  p."voucher_url",
  p."file_key",
  p."uploaded_by_user_id",
  'payment_proof',
  'approved'::"settlement_submission_status",
  p."updated_at",
  jsonb_build_object(
    'legacyPaymentId', p."id",
    'invoiceId', p."invoice_id",
    'reservationId', p."reservation_id",
    'terminalReservationStatus', p."reservation_status"
  ),
  'legacy-terminal-payment:' || p."id",
  p."date",
  p."updated_at"
FROM legacy_terminal_payments AS p
ON CONFLICT ("invoice_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL
  DO NOTHING;
