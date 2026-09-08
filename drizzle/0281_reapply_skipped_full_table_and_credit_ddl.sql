-- Re-applies DDL that 0267-0275 could no longer deliver.
--
-- 0263-0265 were hand-written with `when` values stamped ~2 days into the
-- future (0265 at 1788632136596). bd7dec1b lowered them, but any database
-- migrated before that had already recorded the future stamp as its
-- high-water mark. Drizzle's migrator compares only the newest row's
-- created_at (pg-core/dialect.js:62), so every later-authored migration
-- below that mark -- 0267 through 0275, stamped 1788463075707..1788582741274
-- -- is skipped in silence and can never be picked up again. 0276+ clear the
-- mark and apply normally, which is what makes the gap so easy to miss.
--
-- This carries a current stamp, so it lands on those databases. Every
-- statement is idempotent: on a database that did apply 0267-0275 (any built
-- after bd7dec1b -- CI, the test containers, fresh previews) it is a no-op.

-- 0269_full_table_price
ALTER TABLE "stand_groups"       ADD COLUMN IF NOT EXISTS "full_table_price"          numeric(12, 2);--> statement-breakpoint
ALTER TABLE "stand_holds"        ADD COLUMN IF NOT EXISTS "full_table_price_snapshot" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "stand_reservations" ADD COLUMN IF NOT EXISTS "full_table_price_snapshot" numeric(12, 2);--> statement-breakpoint

-- 0272_credit_top_up_feature_type
ALTER TABLE "credit_top_ups" ADD COLUMN IF NOT EXISTS "intended_feature_type" "festival_reservation_feature_type";--> statement-breakpoint

-- 0268 -> 0271 -> 0274, collapsed to the operation list 0274 settled on. The
-- list only ever grew, so it is a superset of whatever a given database now
-- holds and no stored row can fail it; VALIDATE below is a formality that
-- keeps the constraint from lingering as NOT VALID.
ALTER TABLE "reservation_request_registry"
  DROP CONSTRAINT IF EXISTS "reservation_request_registry_operation_check";--> statement-breakpoint
ALTER TABLE "reservation_request_registry"
  ADD CONSTRAINT "reservation_request_registry_operation_check" CHECK ("reservation_request_registry"."operation" IN (
        'createOrReplaceStandHold',
        'confirmStandHold',
        'submitPaymentProof',
        'applyInvoiceCredits',
        'createInvoiceCreditTopUp',
        'submitZeroValueInvoice',
        'createAdminReservation',
        'adminConfirmReservation',
        'extendReservationPaymentDeadline',
        'createExternalParticipantReservation',
        'correctSettlementProof',
        'activateFullTableAccess',
        'deactivateFullTableAccess',
        'downgradeFullTableReservation',
        'createFeatureCreditTopUp',
        'createDebtCreditTopUp',
        'releaseReservation',
        'addLatePartner'
      )) NOT VALID;--> statement-breakpoint
ALTER TABLE "reservation_request_registry"
  VALIDATE CONSTRAINT "reservation_request_registry_operation_check";
