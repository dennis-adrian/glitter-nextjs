ALTER TABLE "reservation_request_registry" DROP CONSTRAINT "reservation_request_registry_operation_check";--> statement-breakpoint
DROP INDEX "stand_reservations_capacity_stand_unique";--> statement-breakpoint
CREATE INDEX "stand_reservations_stand_id_idx" ON "stand_reservations" USING btree ("stand_id");--> statement-breakpoint
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
        'changeReservationStand'
      ));