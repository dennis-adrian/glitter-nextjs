"use server";

import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { cancelReservation } from "@/app/lib/reservations/admin-service";
import {
  adminConfirmReservation,
  approveInvoiceSettlement,
  findSubmittedSettlementId,
  rejectInvoiceSettlement,
  submitPaymentProof,
  submitZeroValueInvoiceForReview,
} from "@/app/lib/reservations/payment-service";
import {
  parseUnknown,
  positiveIntSchema,
  uuidSchema,
} from "@/app/lib/reservations/schemas";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { invoices } from "@/db/schema";

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

const adminInvoiceStatusSchema = z.object({
  invoiceId: positiveIntSchema,
});

const adminConfirmByReservationSchema = z.object({
  reservationId: positiveIntSchema,
  idempotencyKey: uuidSchema,
});

export async function approveSubmittedSettlementForInvoiceAction(
  input: unknown,
) {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return { success: false, message: "No autorizado." };
  }
  const parsed = parseUnknown(adminInvoiceStatusSchema, input);
  if (!parsed.success) {
    return { success: false, message: "Pago no encontrado." };
  }
  const submissionId = await findSubmittedSettlementId(parsed.data.invoiceId);
  if (!submissionId) {
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, parsed.data.invoiceId),
      columns: { status: true },
    });
    if (invoice?.status === "paid") {
      return { success: true, message: "El pago ya figura como pagado." };
    }
    return {
      success: false,
      message: "No hay una solicitud en revisión para aprobar.",
    };
  }
  const result = await approveInvoiceSettlement({ submissionId });
  return { success: result.success, message: result.message };
}

export async function rejectSubmittedSettlementForInvoiceAction(
  input: unknown,
) {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return { success: false, message: "No autorizado." };
  }
  const parsed = parseUnknown(adminInvoiceStatusSchema, input);
  if (!parsed.success) {
    return { success: false, message: "Pago no encontrado." };
  }
  const submissionId = await findSubmittedSettlementId(parsed.data.invoiceId);
  if (!submissionId) {
    return {
      success: false,
      message: "No hay una solicitud en revisión para devolver a pendiente.",
    };
  }
  const result = await rejectInvoiceSettlement({
    submissionId,
    reason: "Revisión administrativa",
    correction: { type: "keep_amount" },
  });
  return { success: result.success, message: result.message };
}

export async function cancelReservationForInvoiceAction(input: unknown) {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return { success: false, message: "No autorizado." };
  }
  const parsed = parseUnknown(adminInvoiceStatusSchema, input);
  if (!parsed.success) {
    return { success: false, message: "Pago no encontrado." };
  }
  const submissionId = await findSubmittedSettlementId(parsed.data.invoiceId);
  if (submissionId) {
    const result = await rejectInvoiceSettlement({
      submissionId,
      reason: "Cancelado desde el estado de pago",
      correction: { type: "cancel_reservation" },
    });
    return { success: result.success, message: result.message };
  }
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, parsed.data.invoiceId),
    columns: { reservationId: true },
  });
  if (!invoice) {
    return { success: false, message: "Pago no encontrado." };
  }
  return cancelReservation({
    reservationId: invoice.reservationId,
    reason: "Cancelado desde el estado de pago",
  });
}

export async function adminConfirmReservationByReservationIdAction(
  input: unknown,
) {
  const parsed = parseUnknown(adminConfirmByReservationSchema, input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }
  const [ownerInvoice] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.reservationId, parsed.data.reservationId))
    .orderBy(asc(invoices.createdAt))
    .limit(1);
  if (!ownerInvoice) {
    return { success: false, message: "No se encontró la factura de la reserva." };
  }
  const result = await adminConfirmReservation({
    invoiceId: ownerInvoice.id,
    idempotencyKey: parsed.data.idempotencyKey,
  });
  return { success: result.success, message: result.message };
}
