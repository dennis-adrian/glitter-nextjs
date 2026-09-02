"use server";

import { z } from "zod";

import {
  adjustCreditAccount,
  reviewCreditTopUp,
} from "@/app/lib/credits/service";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

const reviewCreditTopUpSchema = z.object({
  topUpId: z.coerce.number().int().positive(),
  decision: z.enum(["approved", "rejected"]),
  rejectionReason: z.string().trim().min(1).max(1_000).optional(),
});
const adjustCreditAccountSchema = z.object({
  userId: z.coerce.number().int().positive(),
  amount: z.coerce.number().multipleOf(0.01).min(-99_999_999.99).max(99_999_999.99),
  reason: z.string().trim().min(1).max(1_000),
  idempotencyKey: z.uuid(),
});

/** Global-admin review command. It intentionally returns no voucher data. */
export async function reviewCreditTopUpAction(input: unknown) {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return { success: false, message: "No autorizado." };
  }

  const parsed = reviewCreditTopUpSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }
  if (
    parsed.data.decision === "rejected" &&
    !parsed.data.rejectionReason?.trim()
  ) {
    return { success: false, message: "Indicá el motivo del rechazo." };
  }

  const result = await reviewCreditTopUp({
    ...parsed.data,
    reviewerUserId: actor.id,
  });
  if (!result.ok) {
    return { success: false, message: "No se pudo revisar la carga de créditos." };
  }
  return {
    success: true,
    message:
      parsed.data.decision === "approved"
        ? "Créditos aprobados."
        : "Carga de créditos rechazada y revertida.",
  };
}

export async function adjustCreditAccountAction(input: unknown) {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return { success: false, message: "No autorizado." };
  }
  const parsed = adjustCreditAccountSchema.safeParse(input);
  if (!parsed.success || parsed.data.amount === 0) {
    return { success: false, message: "Datos inválidos." };
  }
  const result = await adjustCreditAccount(parsed.data);
  return result.ok
    ? { success: true, message: "Saldo ajustado." }
    : { success: false, message: "No se pudo ajustar el saldo." };
}
