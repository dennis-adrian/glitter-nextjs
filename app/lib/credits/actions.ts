"use server";

import { z } from "zod";

import {
  adjustCreditAccount,
  CREDIT_DEBT_RESOLUTIONS,
  resolveCreditDebt,
  reviewCreditTopUp,
} from "@/app/lib/credits/service";
import { scheduleReservationNotificationJobs } from "@/app/lib/reservations/notification-outbox";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

const reviewCreditTopUpSchema = z.object({
  topUpId: z.coerce.number().int().positive(),
  decision: z.enum(["approved", "rejected"]),
  rejectionReason: z.string().trim().min(1).max(1_000).optional(),
});
const resolveCreditDebtSchema = z.object({
  userId: z.coerce.number().int().positive(),
  amount: z.coerce.number().multipleOf(0.01).positive().max(99_999_999.99),
  resolution: z.enum(CREDIT_DEBT_RESOLUTIONS),
  reason: z.string().trim().min(1).max(1_000),
  idempotencyKey: z.uuid(),
});
const adjustCreditAccountSchema = z.object({
  userId: z.coerce.number().int().positive(),
  amount: z.coerce
    .number()
    .multipleOf(0.01)
    .min(-99_999_999.99)
    .max(99_999_999.99),
  reason: z.string().trim().min(1).max(1_000),
  idempotencyKey: z.uuid(),
  /** Set when this adjustment undoes an earlier admin entry. */
  reversesEntryId: z.coerce.number().int().positive().optional(),
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
    return {
      success: false,
      message: "No se pudo revisar la carga de créditos.",
    };
  }
  // Post-commit, like every other outbox caller: the job row is already
  // durable, so a failure to send here is retried rather than lost.
  scheduleReservationNotificationJobs(result.data.jobIds);
  return {
    success: true,
    message:
      parsed.data.decision === "approved"
        ? "Créditos aprobados."
        : "Carga de créditos rechazada y revertida.",
  };
}

/**
 * Global-admin debt resolution. Clearing a debt never reinstates or reverses
 * the reservation, partner, or release the reversed credits paid for.
 */
export async function resolveCreditDebtAction(input: unknown) {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return { success: false, message: "No autorizado." };
  }

  const parsed = resolveCreditDebtSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }

  const result = await resolveCreditDebt({
    ...parsed.data,
    reviewerUserId: actor.id,
  });
  if (!result.ok) {
    if (result.code === "NOT_IN_DEBT") {
      return {
        success: false,
        message: "Esta cuenta ya no tiene saldo pendiente.",
      };
    }
    if (result.code === "AMOUNT_EXCEEDS_DEBT") {
      return {
        success: false,
        message: "El monto supera el saldo pendiente de la cuenta.",
      };
    }
    return { success: false, message: "No se pudo regularizar el saldo." };
  }
  return {
    success: true,
    message:
      parsed.data.resolution === "mark_paid"
        ? "Saldo marcado como pagado."
        : "Saldo condonado.",
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
  if (result.ok) {
    return {
      success: true,
      message: parsed.data.reversesEntryId
        ? "Movimiento revertido."
        : "Saldo ajustado.",
    };
  }
  // The two revert refusals are worth naming: both mean the screen the admin
  // is looking at is stale, and a generic failure would invite a retry that
  // cannot succeed.
  if (result.code === "ENTRY_ALREADY_REVERTED") {
    return {
      success: false,
      message: "Ese movimiento ya fue revertido. Actualizá la página.",
    };
  }
  if (result.code === "ENTRY_NOT_REVERTIBLE") {
    return {
      success: false,
      message: "Ese movimiento no se puede revertir desde acá.",
    };
  }
  return { success: false, message: "No se pudo ajustar el saldo." };
}
