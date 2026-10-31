"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  comunicadosActor,
  logComunicadosFailure,
} from "@/app/lib/comunicados/actor";
import type { ComunicadoActionResult } from "@/app/lib/comunicados/contracts";
import {
  COMUNICADO_RETRACT_REASON_MAX,
  ComunicadoDraftSchema,
} from "@/app/lib/comunicados/definitions";
import { retractComunicado } from "@/app/lib/comunicados/retract";

/*
 * "Retirar…" on a sent comunicado (docs/IMPLEMENTATION-comunicados.md F3,
 * G2, G7). A plain confirmation, not typed: it removes rather than sends.
 */

const COMUNICADOS_PATH = "/dashboard/communications";

const RetractSchema = z.object({
  comunicadoId: ComunicadoDraftSchema.shape.comunicadoId,
  // Postgres refuses NUL in text, so a pasted one would fail the retraction.
  reason: z
    .string({ error: "Contá por qué lo retirás." })
    .transform((value) => value.replace(/\u0000/g, "").trim())
    .pipe(
      z
        .string()
        .min(1, "Contá por qué lo retirás.")
        .max(
          COMUNICADO_RETRACT_REASON_MAX,
          "El motivo puede tener hasta 300 caracteres.",
        ),
    ),
});

const RETRACT_FAILED = "No pudimos retirarlo. Probá de nuevo.";

/** Takes it out of every inbox and cancels what has not gone out yet (F3). */
export async function retractComunicadoAction(
  input: unknown,
): Promise<ComunicadoActionResult> {
  const { actor, blocked } = await comunicadosActor();
  if (blocked) return blocked;
  const parsed = RetractSchema.safeParse(input);
  if (!parsed.success) {
    const reasonIssue = parsed.error.issues.find(
      (issue) => issue.path[0] === "reason",
    );
    return {
      success: false,
      message: reasonIssue?.message ?? "No encontramos este comunicado.",
    };
  }

  const { comunicadoId, reason } = parsed.data;
  try {
    const outcome = await retractComunicado(comunicadoId, { reason }, actor.id);
    if (!outcome.ok) return { success: false, message: outcome.message };
  } catch (error) {
    logComunicadosFailure("[comunicados] retract failed", error);
    return { success: false, message: RETRACT_FAILED };
  }

  revalidatePath(COMUNICADOS_PATH);
  revalidatePath(`${COMUNICADOS_PATH}/${comunicadoId}`);
  return { success: true, message: "Lo retiramos de las notificaciones." };
}
