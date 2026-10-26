"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  comunicadosActor,
  logComunicadosFailure,
} from "@/app/lib/comunicados/actor";
import type { EditComunicadoResult } from "@/app/lib/comunicados/contracts";
import {
  COMUNICADO_EDIT_NOTE_MAX,
  ComunicadoDraftSchema,
} from "@/app/lib/comunicados/definitions";
import {
  type EditComunicadoOutcome,
  editSentComunicado,
} from "@/app/lib/comunicados/edit";

/*
 * "Guardar cambios" on a sent comunicado (docs/IMPLEMENTATION-comunicados.md
 * F1, G2, G7). The fields are only bounded here, as a draft's are; the
 * service checks them as a send would.
 */

const COMUNICADOS_PATH = "/dashboard/communications";

const NOTE_TOO_LONG = `La nota puede tener hasta ${COMUNICADO_EDIT_NOTE_MAX} caracteres.`;

const EditSchema = z.object({
  comunicadoId: ComunicadoDraftSchema.shape.comunicadoId,
  /** The revision the page was opened on; a newer one refuses the edit. */
  expectedRevision: z.number().int().min(1),
  title: ComunicadoDraftSchema.shape.title,
  doc: z.array(z.unknown()),
  actionLabel: ComunicadoDraftSchema.shape.actionLabel,
  actionPath: ComunicadoDraftSchema.shape.actionPath,
  // For the team only. Postgres refuses NUL in text, so a pasted one would
  // fail the edit; an empty note is no note.
  editNote: z
    .string()
    .transform((value) => value.replace(/\u0000/g, "").trim())
    .pipe(z.string().max(COMUNICADO_EDIT_NOTE_MAX, NOTE_TOO_LONG))
    .transform((value) => value || null)
    .nullable(),
});

const UNREADABLE = "No pudimos leer los cambios. Probá de nuevo.";
const EDIT_FAILED = "No pudimos guardar los cambios. Probá de nuevo.";

/** A new revision, everywhere it is read; what already went out stays (F2). */
export async function editComunicadoAction(
  input: unknown,
): Promise<EditComunicadoResult> {
  const { actor, blocked } = await comunicadosActor();
  if (blocked) return { ...blocked, code: "FORBIDDEN" };
  const parsed = EditSchema.safeParse(input);
  if (!parsed.success) {
    // A note too long is the one problem the page can let through.
    const noteIssue = parsed.error.issues.find(
      (issue) => issue.path[0] === "editNote" && issue.code === "too_big",
    );
    return {
      success: false,
      code: "INVALID",
      message: noteIssue?.message ?? UNREADABLE,
    };
  }

  const { comunicadoId, expectedRevision, ...fields } = parsed.data;
  let outcome: EditComunicadoOutcome;
  try {
    outcome = await editSentComunicado(
      comunicadoId,
      { expectedRevision, ...fields },
      actor.id,
    );
  } catch (error) {
    logComunicadosFailure("[comunicados] edit failed", error);
    return { success: false, code: "FAILED", message: EDIT_FAILED };
  }
  if (!outcome.ok) {
    return { success: false, code: outcome.code, message: outcome.message };
  }

  revalidatePath(COMUNICADOS_PATH);
  revalidatePath(`${COMUNICADOS_PATH}/${comunicadoId}`);
  revalidatePath(`${COMUNICADOS_PATH}/${comunicadoId}/edit`);
  return {
    success: true,
    revision: outcome.revision,
    message: "Guardamos los cambios.",
  };
}
