import "server-only";

import {
  CREDITS_NOT_LAUNCHED_GIFT_REASON,
  type CreditGiftListsAvailability,
  NOT_GLOBAL_ADMIN_GIFT_REASON,
} from "@/app/lib/credit_gifts/definitions";
import {
  isFeatureEnabled,
  isFeatureLaunched,
} from "@/app/lib/feature_flags/helpers";
import type { FeatureFlagViewer } from "@/app/lib/feature_flags/visibility";
import { serverEnv } from "@/env";
import {
  canMutateAdminReservations,
  type ReservationActor,
} from "@/app/lib/reservations/policy";

/**
 * Why this actor cannot gift right now, or null when they can. The pages show
 * it on a disabled control; the actions enforce the same two rules.
 */
export async function creditGiftBlocker(
  actor: ReservationActor | null | undefined,
): Promise<string | null> {
  if (!canMutateAdminReservations(actor)) return NOT_GLOBAL_ADMIN_GIFT_REASON;
  if (!(await isFeatureLaunched("credits"))) {
    return CREDITS_NOT_LAUNCHED_GIFT_REASON;
  }
  return null;
}

/**
 * Whether the picker's "Agregar una lista" shows, and whether it works. Hidden
 * from anyone who cannot see the lists; disabled outside production, where
 * gift email is real and a gift cannot be narrowed to admins (B9, K16).
 */
export async function creditGiftListsAvailability(
  actor: FeatureFlagViewer,
): Promise<CreditGiftListsAvailability> {
  if (!canMutateAdminReservations(actor)) return "hidden";
  if (!(await isFeatureEnabled("comunicados", actor))) return "hidden";
  return serverEnv.VERCEL_ENV === "production" ? "enabled" : "staging";
}
