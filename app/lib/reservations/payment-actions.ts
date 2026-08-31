"use server";

import {
  adminConfirmReservation,
  approveInvoiceSettlement,
  rejectInvoiceSettlement,
  submitPaymentProof,
  submitZeroValueInvoiceForReview,
} from "@/app/lib/reservations/payment-service";

export async function submitPaymentProofAction(input: unknown) {
  return submitPaymentProof(input);
}

export async function submitZeroValueInvoiceForReviewAction(input: unknown) {
  return submitZeroValueInvoiceForReview(input);
}

export async function approveInvoiceSettlementAction(input: unknown) {
  return approveInvoiceSettlement(input);
}

export async function rejectInvoiceSettlementAction(input: unknown) {
  return rejectInvoiceSettlement(input);
}

export async function adminConfirmReservationAction(input: unknown) {
  return adminConfirmReservation(input);
}
