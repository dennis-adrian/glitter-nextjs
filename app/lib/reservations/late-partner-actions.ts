"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createFeatureCreditTopUp } from "@/app/lib/credits/purchase-service";
import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { addLatePartner } from "@/app/lib/reservations/late-partner-service";
import { fetchLatePartnerOffer } from "@/app/lib/reservations/late-partner-queries";
import { scheduleReservationNotificationJobs } from "@/app/lib/reservations/notification-outbox";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

const addSchema = z.object({
  reservationId: z.coerce.number().int().positive(),
  partnerUserId: z.coerce.number().int().positive(),
  idempotencyKey: z.string().uuid(),
});

const fundSchema = z.object({
  reservationId: z.coerce.number().int().positive(),
  idempotencyKey: z.string().uuid(),
});

/**
 * Adds the partner (PRD §8.3).
 *
 * The browser names a reservation, a person and a retry key. The price, the
 * deadline, ownership and eligibility are all decided server-side.
 */
export async function addLatePartnerAction(input: unknown) {
  const blocked = await featureFlagGuard("credits");
  if (blocked) return blocked;

  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, message: "Datos inválidos." };
  }

  const result = await addLatePartner(parsed.data);
  if (result.success) {
    scheduleReservationNotificationJobs(result.data.jobIds);
    try {
      revalidatePath("/profiles", "layout");
      revalidatePath("/dashboard/festivals/[id]/reservations", "page");
    } catch (error) {
      console.error("[late-partner] revalidatePath failed", error);
    }
  }

  return result.success
    ? { success: true as const, message: result.message }
    : { success: false as const, message: result.message };
}

/**
 * Buys the exact shortfall for a late partner.
 *
 * Its own entry point rather than the shared feature purchase, because this is
 * the one feature whose price is not the festival's configured figure: it also
 * carries the difference between the individual and shared price of *this*
 * reservation. The browser sends the reservation id and the server works the
 * total out from that reservation's own snapshots, so no amount ever
 * originates in the browser.
 */
export async function createLatePartnerCreditTopUpAction(input: unknown) {
  const blocked = await featureFlagGuard("credits");
  if (blocked) return blocked;

  const parsed = fundSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, message: "Datos inválidos." };
  }

  const actor = await getCurrentUserProfile();
  if (!actor) {
    return { success: false as const, message: "Tenés que iniciar sesión." };
  }

  // The same derivation the page renders and the command re-checks, so the
  // purchase cannot be sized against a price nobody else agrees with.
  const offer = await fetchLatePartnerOffer({
    reservationId: parsed.data.reservationId,
    userId: actor.id,
  });
  if (!offer.offered) {
    return {
      success: false as const,
      message: "Agregar un compañero no está disponible para esta reserva.",
    };
  }

  const result = await createFeatureCreditTopUp({
    festivalId: offer.festivalId,
    featureType: "late_partner",
    requiredCredits: offer.totalCredits,
    idempotencyKey: parsed.data.idempotencyKey,
  });

  if (!result.success) {
    return { success: false as const, message: result.message };
  }

  revalidatePath("/my_credits");
  return {
    success: true as const,
    message: result.message,
    topUpId: result.data.topUpId,
    amount: result.data.amount,
    uploadDeadlineAt: result.data.uploadDeadlineAt,
  };
}
