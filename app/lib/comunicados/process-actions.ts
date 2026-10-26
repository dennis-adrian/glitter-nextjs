"use server";

import { after } from "next/server";

import { comunicadosActor } from "@/app/lib/comunicados/actor";
import type { ComunicadoActionResult } from "@/app/lib/comunicados/contracts";
import {
  COMUNICADOS_PROCESS_RATE_LIMIT,
  PROCESS_BUTTON_DEADLINE_MS,
} from "@/app/lib/comunicados/definitions";
import { runComunicadoWork } from "@/app/lib/comunicados/driver";
import { consumeActionRateLimit } from "@/app/lib/rate-limit";
import { serverEnv } from "@/env";

/*
 * "Procesar envíos pendientes" (docs/IMPLEMENTATION-comunicados.md D9, G2):
 * Vercel runs crons in production only, so on a preview this is what drains
 * retries, held batches and anything a send's own run left behind.
 */

/**
 * One lane-wide run of the work, after the answer. Previews only, and once
 * per 30 s across every admin: overlapping runs are safe, but each one is a
 * function kept busy for up to 80 s. The deadline is counted from the moment
 * the action starts, so the work fits the function's `maxDuration`.
 */
export async function processPendingComunicadosAction(): Promise<ComunicadoActionResult> {
  const deadline = Date.now() + PROCESS_BUTTON_DEADLINE_MS;
  const { blocked } = await comunicadosActor();
  if (blocked) return blocked;
  if (serverEnv.VERCEL_ENV !== "preview") {
    return {
      success: false,
      message: "Esto solo se usa en un entorno de prueba.",
    };
  }

  const allowed = await consumeActionRateLimit(
    COMUNICADOS_PROCESS_RATE_LIMIT,
  ).catch(() => null);
  if (allowed === null) {
    return {
      success: false,
      message:
        "No pudimos procesar los envíos. Intentá de nuevo en unos minutos.",
    };
  }
  if (!allowed) {
    return {
      success: false,
      message:
        "Ya se están procesando. Esperá unos segundos y volvé a intentarlo.",
    };
  }

  after(async () => {
    try {
      await runComunicadoWork({ scope: "lane", deadline, trigger: "button" });
    } catch (error) {
      // What is left waits for the next click.
      console.error("[comunicados] button work failed", {
        errorType: error instanceof Error ? error.name : typeof error,
      });
    }
  });
  return {
    success: true,
    message: "Procesando los envíos pendientes. En un minuto deberían verse.",
  };
}
