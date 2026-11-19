-- One migration for this branch: admin participation transfers and profile
-- deletions that remember an unconfirmed Clerk request.
--
-- Stamped with the latest of the migrations it replaces (0314 to 0316), and
-- every statement is safe to run again: a database that applied all three
-- skips it, and one that applied only some runs it whole.

-- Admin participation transfers: lets the request registry record the
-- command that moves one participation between accounts, so a retry whose
-- answer was lost replays it instead of running again.
ALTER TABLE "reservation_request_registry" DROP CONSTRAINT IF EXISTS "reservation_request_registry_operation_check";--> statement-breakpoint
ALTER TABLE "reservation_request_registry" ADD CONSTRAINT "reservation_request_registry_operation_check" CHECK ("reservation_request_registry"."operation" IN (
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
        'addLatePartner',
        'changeReservationStand',
        'settleInvoiceShortfall',
        'upgradeFullTableReservation',
        'transferReservationParticipation'
      ));--> statement-breakpoint

-- Profile deletions: remember a Clerk deletion whose outcome is not known, so
-- a later "the login still exists" never releases an account whose earlier
-- request may still land.
ALTER TABLE "pending_user_deletions" ADD COLUMN IF NOT EXISTS "clerk_attempted_at" timestamp;--> statement-breakpoint

-- Rows the earlier code left unfinished carry no record of whether it sent
-- Clerk a deletion (the cron did before checking anything, and recorded only
-- its error). Each is treated as having sent one when it last changed, so a
-- refusal releases it only once Clerk confirms the login still exists, never
-- straight away.
UPDATE "pending_user_deletions"
SET "clerk_attempted_at" = "updated_at"
WHERE "clerk_attempted_at" IS NULL
  AND "clerk_deleted_at" IS NULL
  AND "local_deleted_at" IS NULL;
