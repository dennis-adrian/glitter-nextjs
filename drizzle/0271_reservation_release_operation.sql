-- Reservation release is an idempotent participant mutation, so it needs to be
-- claimable in the request registry. The check is a hard-coded IN list, so it
-- is dropped and rewritten in full on every addition.
--
-- Added NOT VALID for the same reason as 0268: the list only grows, so every
-- row that satisfied the old constraint satisfies this one, and a validating
-- ADD CONSTRAINT would scan the whole table while holding ACCESS EXCLUSIVE.
-- 0273 validates it in its own transaction, under SHARE UPDATE EXCLUSIVE,
-- where the scan blocks neither reads nor writes.
ALTER TABLE "reservation_request_registry" DROP CONSTRAINT "reservation_request_registry_operation_check";--> statement-breakpoint
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
        'releaseReservation'
      )) NOT VALID;
