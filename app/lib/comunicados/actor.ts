import "server-only";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

/** What an action hands back when it refuses or fails. */
export type ComunicadosFailure = { success: false; message: string };

/**
 * Global admins with the flag on, before anything else (G2). Festival admins
 * see nothing of Comunicaciones, so they are refused here too.
 */
export async function comunicadosActor() {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return {
      actor: null,
      blocked: {
        success: false,
        message: "No autorizado.",
      } as ComunicadosFailure,
    };
  }
  const blocked = await featureFlagGuard("comunicados", actor);
  if (blocked) return { actor: null, blocked };
  return { actor, blocked: null };
}

/** The error's type only: its message may carry an address. */
export function logComunicadosFailure(log: string, error: unknown) {
  console.error(log, {
    errorType: error instanceof Error ? error.name : typeof error,
  });
}
