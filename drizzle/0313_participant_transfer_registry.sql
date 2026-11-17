-- Admin participation transfers: lets the request registry record the
-- command that moves one participation between accounts, so a retry whose
-- answer was lost replays it instead of running again.
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
        'releaseReservation',
        'addLatePartner',
        'changeReservationStand',
        'settleInvoiceShortfall',
        'upgradeFullTableReservation',
        'transferReservationParticipation'
      ));