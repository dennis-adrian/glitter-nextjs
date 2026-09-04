-- Feature and debt credit purchases are idempotent participant mutations, so
-- they need to be claimable in the request registry. The check is a hard-coded
-- IN list, so it is dropped and rewritten in full on every addition.
--
-- Added NOT VALID so the ADD CONSTRAINT does not scan every existing row while
-- holding ACCESS EXCLUSIVE: the list only grows, so rows that satisfied the old
-- constraint satisfy this one. 0270 validates it in its own transaction, under
-- SHARE UPDATE EXCLUSIVE, where the scan does not block reads or writes.
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
        'createDebtCreditTopUp'
      )) NOT VALID;
