"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import {
  comunicadosActor,
  logComunicadosFailure,
} from "@/app/lib/comunicados/actor";
import type {
  LoadResendPreviewResult,
  ResendComunicadoActionResult,
} from "@/app/lib/comunicados/contracts";
import {
  COMUNICADO_RESEND_MAX_PEOPLE,
  ComunicadoDraftSchema,
  SEND_AFTER_DEADLINE_MS,
} from "@/app/lib/comunicados/definitions";
import { runComunicadoWork } from "@/app/lib/comunicados/driver";
import {
  type ComunicadoPersonOption,
  searchComunicadoPeople,
} from "@/app/lib/comunicados/queries";
import {
  previewComunicadoResend,
  resendComunicado,
  type ResendComunicadoResult,
  ResendRefusal,
} from "@/app/lib/comunicados/resend";
import { formatAudienceCount } from "@/app/lib/distribution_lists/definitions";
import { MAX_SERIAL_ID } from "@/app/lib/notifications/definitions";
import { db } from "@/db";
import { comunicados } from "@/db/schema";

/*
 * "Enviar a más personas" on a sent comunicado
 * (docs/IMPLEMENTATION-comunicados.md G2, G10, D9): the dialog's numbers,
 * the person search that knows who already has it, and the resend.
 */

const COMUNICADOS_PATH = "/dashboard/communications";

const ComunicadoIdSchema = ComunicadoDraftSchema.shape.comunicadoId;

const ResendRequestSchema = z.object({
  comunicadoId: ComunicadoIdSchema,
  includeAudience: z.boolean(),
  people: z
    .array(z.number().int().positive().max(MAX_SERIAL_ID))
    .max(
      COMUNICADO_RESEND_MAX_PEOPLE,
      `Elegí hasta ${COMUNICADO_RESEND_MAX_PEOPLE} personas por nombre.`,
    )
    .transform((ids) => [...new Set(ids)]),
  sendEmail: z.boolean(),
  sendPush: z.boolean(),
});

const ResendSchema = ResendRequestSchema.extend({
  requestKey: z.uuid(),
  expectEssential: z.boolean(),
  typedCount: z.number().int().min(0).nullable(),
});

const COUNT_FAILED =
  "No pudimos contar a quiénes les llegaría. Probá de nuevo.";
const RESEND_FAILED = "No pudimos enviarlo. Intentá de nuevo en unos minutos.";

/** The toast: how many it is on its way to. */
function resentMessage(willReceive: number) {
  if (willReceive === 0) {
    // A preview whose newcomers came only from lists (B6).
    return "Listo: en el entorno de prueba no se envía a listas, así que no le llega a nadie más.";
  }
  return willReceive === 1
    ? "Se lo estamos enviando a 1 persona más."
    : `Se lo estamos enviando a ${formatAudienceCount(willReceive)} personas más.`;
}

/** The dialog's numbers (G10), read fresh each time the choice changes. */
export async function loadComunicadoResendPreviewAction(
  input: unknown,
): Promise<LoadResendPreviewResult> {
  const { blocked } = await comunicadosActor();
  if (blocked) return blocked;
  const parsed = ResendRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? COUNT_FAILED,
    };
  }
  const { comunicadoId, ...request } = parsed.data;
  try {
    return {
      success: true,
      preview: await previewComunicadoResend(comunicadoId, request),
    };
  } catch (error) {
    logComunicadosFailure("[comunicados] resend preview failed", error);
    return { success: false, message: COUNT_FAILED };
  }
}

/**
 * The dialog's person search: participants and global admins, as the
 * composer's, with whoever is already in this comunicado offered disabled.
 */
export async function searchComunicadoResendPeopleAction(
  comunicadoId: unknown,
  query: unknown,
): Promise<ComunicadoPersonOption[]> {
  const { blocked } = await comunicadosActor();
  if (blocked) return [];
  const id = ComunicadoIdSchema.safeParse(comunicadoId);
  if (!id.success || typeof query !== "string") return [];
  const [row] = await db
    .select({ campaignId: comunicados.campaignId })
    .from(comunicados)
    .where(eq(comunicados.id, id.data))
    .limit(1);
  if (!row?.campaignId) return [];
  return searchComunicadoPeople(query, { campaignId: row.campaignId });
}

/**
 * "Enviar a N personas" (G10): writes their rows, then drains the campaign
 * after the answer, as "Enviar ahora" does (D9). The deadline counts from
 * the moment the action starts, so the request and the work after it fit
 * under the function's `maxDuration`.
 */
export async function resendComunicadoAction(
  input: unknown,
): Promise<ResendComunicadoActionResult> {
  const deadline = Date.now() + SEND_AFTER_DEADLINE_MS;
  const { actor, blocked } = await comunicadosActor();
  if (blocked) return { ...blocked, code: "FORBIDDEN" };
  const parsed = ResendSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      code: "INVALID",
      message:
        parsed.error.issues[0]?.message ??
        "No pudimos leer la confirmación. Probá de nuevo.",
    };
  }
  const { comunicadoId, ...opts } = parsed.data;

  let result: ResendComunicadoResult;
  try {
    result = await resendComunicado(comunicadoId, { ...opts, by: actor.id });
  } catch (error) {
    if (error instanceof ResendRefusal) {
      return { success: false, code: error.code, message: error.message };
    }
    logComunicadosFailure("[comunicados] resend failed", error);
    return { success: false, code: "FAILED", message: RESEND_FAILED };
  }

  if (result.kind === "already_resent") {
    return { success: true, message: "Ya lo estamos enviando." };
  }

  const { campaignId } = result;
  after(async () => {
    try {
      await runComunicadoWork({
        scope: { campaignId },
        deadline,
        trigger: "send",
      });
    } catch (error) {
      // What is left is the cron's, or the preview button's.
      console.error("[comunicados] resend work failed", {
        campaignId,
        errorType: error instanceof Error ? error.name : typeof error,
      });
    }
  });
  revalidatePath(COMUNICADOS_PATH);
  revalidatePath(`${COMUNICADOS_PATH}/${comunicadoId}`);
  return { success: true, message: resentMessage(result.willReceive) };
}
