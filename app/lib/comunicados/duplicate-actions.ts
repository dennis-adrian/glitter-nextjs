"use server";

import { revalidatePath } from "next/cache";

import {
  comunicadosActor,
  logComunicadosFailure,
} from "@/app/lib/comunicados/actor";
import type { DuplicateComunicadoResult } from "@/app/lib/comunicados/contracts";
import { ComunicadoDraftSchema } from "@/app/lib/comunicados/definitions";
import { duplicateComunicado } from "@/app/lib/comunicados/duplicate";

/*
 * "Duplicar" on any comunicado (docs/IMPLEMENTATION-comunicados.md G2, G6).
 * The page then opens the copy with "Copia de «…»".
 */

const COMUNICADOS_PATH = "/dashboard/communications";

const ComunicadoIdSchema = ComunicadoDraftSchema.shape.comunicadoId;

const NOT_FOUND = "No encontramos este comunicado.";

/** A new draft from this comunicado, for the composer to open. */
export async function duplicateComunicadoAction(
  comunicadoId: unknown,
): Promise<DuplicateComunicadoResult> {
  const { actor, blocked } = await comunicadosActor();
  if (blocked) return blocked;
  const parsed = ComunicadoIdSchema.safeParse(comunicadoId);
  if (!parsed.success) return { success: false, message: NOT_FOUND };

  let copyId: number | null;
  try {
    copyId = await duplicateComunicado(parsed.data, actor.id);
  } catch (error) {
    logComunicadosFailure("[comunicados] duplicate failed", error);
    return {
      success: false,
      message: "No pudimos duplicarlo. Probá de nuevo.",
    };
  }
  if (copyId === null) return { success: false, message: NOT_FOUND };

  revalidatePath(COMUNICADOS_PATH);
  return { success: true, comunicadoId: copyId };
}
