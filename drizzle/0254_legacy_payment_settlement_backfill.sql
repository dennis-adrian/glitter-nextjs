-- Payment rows created before the settlement lifecycle have no corresponding
-- submission. Preserve their evidence with one deterministic submission per
-- invoice; do not alter reservation or invoice status in this migration.
WITH legacy_payments AS (
  SELECT DISTINCT ON (p."invoice_id")
    p."id",
    p."invoice_id",
    p."voucher_url",
    p."file_key",
    p."uploaded_by_user_id",
    p."date",
    p."updated_at",
    i."status" AS "invoice_status",
    i."reservation_id"
  FROM "payments" AS p
  INNER JOIN "invoices" AS i ON i."id" = p."invoice_id"
  WHERE i."status" IN ('verification_payment', 'paid')
    AND NOT EXISTS (
      SELECT 1
      FROM "invoice_settlement_submissions" AS s
      WHERE s."invoice_id" = i."id"
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
  CASE
    WHEN p."invoice_status" = 'paid' THEN 'approved'::"settlement_submission_status"
    ELSE 'submitted'::"settlement_submission_status"
  END,
  CASE WHEN p."invoice_status" = 'paid' THEN p."updated_at" ELSE NULL END,
  jsonb_build_object(
    'legacyPaymentId', p."id",
    'invoiceId', p."invoice_id",
    'reservationId', p."reservation_id"
  ),
  'legacy-payment:' || p."id",
  p."date",
  p."updated_at"
FROM legacy_payments AS p
ON CONFLICT ("invoice_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL
  DO NOTHING;
