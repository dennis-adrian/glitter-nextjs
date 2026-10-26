"use server";

import { z } from "zod";

import {
  comunicadosActor,
  logComunicadosFailure,
} from "@/app/lib/comunicados/actor";
import type { LoadComunicadoRevisionResult } from "@/app/lib/comunicados/contracts";
import { ComunicadoDraftSchema } from "@/app/lib/comunicados/definitions";
import { fetchComunicadoRevision } from "@/app/lib/comunicados/revisions";
import { MAX_SERIAL_ID } from "@/app/lib/notifications/definitions";

/*
 * "Ver" on a row of the report's "Historial" (docs/IMPLEMENTATION-comunicados.md
 * G2, G6): that version as it was written, read when it is opened.
 */

const LoadRevisionSchema = z.object({
  comunicadoId: ComunicadoDraftSchema.shape.comunicadoId,
  // An integer column: anything past it is no version, not a database error.
  revision: z.number().int().min(1).max(MAX_SERIAL_ID),
});

const NOT_FOUND = "No encontramos esta versión.";

/** One version's title, rendered text, button and note. */
export async function loadComunicadoRevisionAction(
  input: unknown,
): Promise<LoadComunicadoRevisionResult> {
  const { blocked } = await comunicadosActor();
  if (blocked) return blocked;
  const parsed = LoadRevisionSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: NOT_FOUND };

  const { comunicadoId, revision } = parsed.data;
  try {
    const found = await fetchComunicadoRevision(comunicadoId, revision);
    if (!found) return { success: false, message: NOT_FOUND };
    return {
      success: true,
      revision: {
        revision: found.revision,
        title: found.title,
        html: found.html,
        actionLabel: found.actionLabel,
        actionPath: found.actionPath,
        editNote: found.editNote,
        createdAt: found.createdAt.toISOString(),
        createdByName: found.createdByName,
      },
    };
  } catch (error) {
    logComunicadosFailure("[comunicados] revision load failed", error);
    return {
      success: false,
      message: "No pudimos cargar esta versión. Probá de nuevo.",
    };
  }
}
