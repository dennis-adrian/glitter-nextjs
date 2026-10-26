"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import {
  comunicadosActor,
  logComunicadosFailure,
} from "@/app/lib/comunicados/actor";
import type { ComunicadoActionResult } from "@/app/lib/comunicados/contracts";
import {
  ComunicadoDraftSchema,
  comunicadoRetryRateLimit,
  SEND_AFTER_DEADLINE_MS,
} from "@/app/lib/comunicados/definitions";
import { runComunicadoWork } from "@/app/lib/comunicados/driver";
import {
  type RetryFailedOutcome,
  retryFailedComunicado,
} from "@/app/lib/comunicados/retry";
import {
  consumeActionRateLimit,
  releaseActionRateLimit,
} from "@/app/lib/rate-limit";

/*
 * "Reintentar fallidos (N)" on a sent comunicado
 * (docs/IMPLEMENTATION-comunicados.md G2, G6, D9).
 */

const COMUNICADOS_PATH = "/dashboard/communications";

const ComunicadoIdSchema = ComunicadoDraftSchema.shape.comunicadoId;

const RETRY_FAILED = "No pudimos reintentarlo. Probá de nuevo.";

/**
 * Nothing was retried: the slot goes back, so the "probá de nuevo" the
 * answer gives is not refused for it. Best-effort.
 */
async function giveBack(limit: Parameters<typeof releaseActionRateLimit>[0]) {
  await releaseActionRateLimit(limit).catch(() => {});
}

/**
 * Reopens what failed, then drains it after the answer, as "Enviar ahora"
 * does (D9). Once per 5 minutes per comunicado, across every admin; an
 * attempt that rolled back (a lock held elsewhere, a failure) does not
 * count. The work's deadline is counted from the moment the action starts,
 * so the request and the work after it fit under the function's
 * `maxDuration`.
 */
export async function retryFailedComunicadoAction(
  comunicadoId: unknown,
): Promise<ComunicadoActionResult> {
  const deadline = Date.now() + SEND_AFTER_DEADLINE_MS;
  const { actor, blocked } = await comunicadosActor();
  if (blocked) return blocked;
  const parsed = ComunicadoIdSchema.safeParse(comunicadoId);
  if (!parsed.success) {
    return { success: false, message: "No encontramos este comunicado." };
  }
  const id = parsed.data;

  // One clock for the spend and the give-back: the same window.
  const limit = { ...comunicadoRetryRateLimit(id), now: new Date() };
  const allowed = await consumeActionRateLimit(limit).catch(() => null);
  if (allowed === null) return { success: false, message: RETRY_FAILED };
  if (!allowed) {
    return {
      success: false,
      message: "Ya se reintentó hace poco. Probá de nuevo en unos minutos.",
    };
  }

  let outcome: RetryFailedOutcome;
  try {
    outcome = await retryFailedComunicado(id, actor.id);
  } catch (error) {
    logComunicadosFailure("[comunicados] retry failed", error);
    await giveBack(limit);
    return { success: false, message: RETRY_FAILED };
  }
  if (!outcome.ok) {
    // The other refusals are final: another click answers the same.
    if (outcome.code === "LOCKED") await giveBack(limit);
    return { success: false, message: outcome.message };
  }

  const { campaignId } = outcome;
  after(async () => {
    try {
      await runComunicadoWork({
        scope: { campaignId },
        deadline,
        trigger: "send",
      });
    } catch (error) {
      // What is left is the cron's, or the preview button's.
      console.error("[comunicados] retry work failed", {
        campaignId,
        errorType: error instanceof Error ? error.name : typeof error,
      });
    }
  });
  revalidatePath(COMUNICADOS_PATH);
  revalidatePath(`${COMUNICADOS_PATH}/${id}`);
  return { success: true, message: "Los estamos reintentando." };
}
