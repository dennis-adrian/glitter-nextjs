-- Targeted recovery from an approved payment overwritten by a balance upload.
-- Dry run by default: psql -X -v ON_ERROR_STOP=1 -f this-file.sql
-- Commit only on the intended database: add -v apply=true.
-- Does not approve the new voucher or send notifications.
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply false
\endif

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

DO $$
DECLARE
  old_proof invoice_settlement_submissions%ROWTYPE;
  new_proof invoice_settlement_submissions%ROWTYPE;
  overwritten payments%ROWTYPE;
  new_payment_id integer;
BEGIN
  PERFORM 1 FROM stand_reservations
    WHERE id = 1937 AND festival_id = 490 AND owner_user_id = 4258
      AND status = 'verification_payment' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation 1937 changed; review before repairing'; END IF;
  PERFORM 1 FROM invoices WHERE id = 1867 AND reservation_id = 1937
    AND amount = 390 AND status = 'verification_payment' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice 1867 changed; review before repairing'; END IF;
  SELECT * INTO STRICT overwritten FROM payments WHERE id = 1488 AND invoice_id = 1867 FOR UPDATE;
  PERFORM 1 FROM invoice_settlement_submissions WHERE invoice_id = 1867 ORDER BY id FOR UPDATE;
  SELECT * INTO STRICT old_proof FROM invoice_settlement_submissions WHERE id = 1475;
  SELECT * INTO STRICT new_proof FROM invoice_settlement_submissions WHERE id = 1547;

  IF old_proof.invoice_id <> 1867 OR new_proof.invoice_id <> 1867
    OR old_proof.status <> 'approved' OR new_proof.status <> 'submitted'
    OR old_proof.payment_id <> 1488
    OR (old_proof.evidence_snapshot->>'amount')::numeric IS DISTINCT FROM 350
    OR (new_proof.evidence_snapshot->>'amount')::numeric IS DISTINCT FROM 40
    OR old_proof.voucher_url IS NULL OR old_proof.file_key IS NULL
    OR new_proof.voucher_url IS NULL OR new_proof.file_key IS NULL
  THEN RAISE EXCEPTION 'Saved payment evidence does not match expected repair'; END IF;

  IF new_proof.payment_id <> 1488 THEN
    IF overwritten.amount = 350 AND EXISTS (
      SELECT 1 FROM payments WHERE id = new_proof.payment_id AND invoice_id = 1867
        AND amount = 40 AND file_key = new_proof.file_key
    ) THEN
      RAISE NOTICE 'Reservation 1937 already repaired';
      RETURN;
    END IF;
    RAISE EXCEPTION 'Payment links changed; review before repairing';
  END IF;
  IF overwritten.amount <> 40 OR overwritten.file_key IS DISTINCT FROM new_proof.file_key
    OR overwritten.voucher_url IS DISTINCT FROM new_proof.voucher_url
    OR (SELECT count(*) FROM payments WHERE invoice_id = 1867) <> 1
    OR (SELECT count(*) FROM invoice_settlement_submissions WHERE invoice_id = 1867) <> 2
    OR EXISTS (SELECT 1 FROM invoice_credit_allocations WHERE invoice_id = 1867)
  THEN RAISE EXCEPTION 'Invoice tender changed; review before repairing'; END IF;

  -- Restore the original evidence first, freeing the new upload's unique key.
  UPDATE payments SET amount = 350, date = old_proof.created_at,
    voucher_url = old_proof.voucher_url, file_key = old_proof.file_key,
    uploaded_by_user_id = old_proof.uploaded_by_user_id,
    idempotency_key = old_proof.idempotency_key, updated_at = now()
  WHERE id = 1488;

  INSERT INTO payments (invoice_id, amount, date, voucher_url, file_key,
    uploaded_by_user_id, idempotency_key, created_at, updated_at)
  VALUES (1867, 40, overwritten.date, new_proof.voucher_url, new_proof.file_key,
    new_proof.uploaded_by_user_id, overwritten.idempotency_key,
    new_proof.created_at, now()) RETURNING id INTO new_payment_id;

  UPDATE invoice_settlement_submissions SET payment_id = new_payment_id, updated_at = now()
    WHERE id = 1547;
  INSERT INTO stand_reservation_events (reservation_id, event_type, from_status,
    to_status, payload, idempotency_key)
  VALUES (1937, 'status_changed', 'verification_payment', 'verification_payment',
    jsonb_build_object('action', 'payment_history_repaired', 'invoiceId', 1867,
      'restoredPaymentId', 1488, 'restoredAmount', 350, 'newPaymentId', new_payment_id,
      'submissionId', 1547, 'submittedAmount', 40,
      'reason', 'Separate approved payment from later stand-upgrade proof; restore saved evidence'),
    'repair-reservation-1937-split-approved-payment');
END $$;

SELECT s.id AS submission_id, s.status, s.payment_id, p.amount
FROM invoice_settlement_submissions s JOIN payments p ON p.id = s.payment_id
WHERE s.invoice_id = 1867 ORDER BY s.id;

\if :apply
  COMMIT;
\else
  ROLLBACK;
\endif
