import "server-only";

import {
  CREDITS_NOT_LAUNCHED_GIFT_REASON,
  NOT_GLOBAL_ADMIN_GIFT_REASON,
} from "@/app/lib/credit_gifts/definitions";
import { isFeatureLaunched } from "@/app/lib/feature_flags/helpers";
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
