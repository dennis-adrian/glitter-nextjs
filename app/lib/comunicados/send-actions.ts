"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import {
  comunicadosActor,
  logComunicadosFailure,
} from "@/app/lib/comunicados/actor";
import { pickedPeopleReceiving } from "@/app/lib/comunicados/audience";
import type {
  LoadSendConfirmationResult,
  SendComunicadoNowResult,
} from "@/app/lib/comunicados/contracts";
import {
  COMUNICADO_UNTITLED,
  ComunicadoDraftSchema,
  parseStoredComunicadoAudience,
  SEND_AFTER_DEADLINE_MS,
} from "@/app/lib/comunicados/definitions";
import { runComunicadoWork } from "@/app/lib/comunicados/driver";
import {
  audienceTooLargeMessage,
  checkComunicadoSendable,
  SEND_MESSAGES,
  type SendNowResult,
  SendRefusal,
  sendComunicadoNow,
  typedConfirmationRequired,
} from "@/app/lib/comunicados/send";
import { isFeatureLaunched } from "@/app/lib/feature_flags/helpers";
import { db } from "@/db";
import { comunicados } from "@/db/schema";
import { serverEnv } from "@/env";

/*
 * "Enviar…" (docs/IMPLEMENTATION-comunicados.md D1, D9, G5): the confirm
 * dialog's numbers, read fresh when it opens, and the send it confirms.
 */

const COMUNICADOS_PATH = "/dashboard/communications";

const ComunicadoIdSchema = ComunicadoDraftSchema.shape.comunicadoId;

const SendNowSchema = z.object({
  comunicadoId: ComunicadoIdSchema,
  /** The version the dialog's numbers are for. */
  expectedVersion: z.number().int().min(1),
  /** What was typed, when the dialog asked for it; the server re-counts. */
  typedCount: z.number().int().min(0).nullable(),
});

const COUNT_FAILED = "No pudimos contar los destinatarios. Probá de nuevo.";
const SEND_FAILED = "No pudimos enviarlo. Intentá de nuevo en unos minutos.";

/**
 * The confirm dialog's numbers (G5), from the stored draft: who can receive
 * it today, by channel, and the refusal the send would answer right now, if
 * any. Reads only, without a lock: the send checks it all again under its
 * own, and refuses a draft that changed since (`expectedVersion`).
 */
export async function loadComunicadoSendConfirmationAction(
  comunicadoId: unknown,
): Promise<LoadSendConfirmationResult> {
  const { blocked } = await comunicadosActor();
  if (blocked) return blocked;
  const parsed = ComunicadoIdSchema.safeParse(comunicadoId);
  if (!parsed.success) {
    return { success: false, message: SEND_MESSAGES.notFound };
  }

  try {
    const [row] = await db
      .select({
        id: comunicados.id,
        status: comunicados.status,
        version: comunicados.version,
        title: comunicados.title,
        doc: comunicados.doc,
        actionLabel: comunicados.actionLabel,
        actionPath: comunicados.actionPath,
        sendEmail: comunicados.sendEmail,
        sendPush: comunicados.sendPush,
        audience: comunicados.audience,
        essential: comunicados.essential,
        essentialReason: comunicados.essentialReason,
      })
      .from(comunicados)
      .where(eq(comunicados.id, parsed.data))
      .limit(1);
    if (!row) return { success: false, message: SEND_MESSAGES.notFound };
    if (row.status === "sent") {
      return { success: false, message: "Este comunicado ya se envió." };
    }

    // The server's own environment, as the send reads it (B6).
    const env = serverEnv.VERCEL_ENV;
    const narrow = env !== "production";
    const people = parseStoredComunicadoAudience(row.audience)?.people ?? [];
    const [check, pickedReceiving, notificationsLaunched] = await Promise.all([
      checkComunicadoSendable(db, row, { env, narrow }),
      pickedPeopleReceiving(db, people, narrow),
      isFeatureLaunched("notifications"),
    ]);
    const { preview } = check;
    const problem = !check.ok
      ? check.refusal.message
      : preview.tooLarge
        ? audienceTooLargeMessage()
        : preview.eligible === 0
          ? SEND_MESSAGES.noEligible
          : null;

    return {
      success: true,
      confirmation: {
        comunicadoId: row.id,
        version: row.version,
        title: check.ok
          ? check.content.title
          : row.title.trim() || COMUNICADO_UNTITLED,
        sendEmail: row.sendEmail,
        sendPush: row.sendPush,
        essential: row.essential,
        essentialReason: row.essential
          ? row.essentialReason?.trim() || null
          : null,
        essentialFestivalName: row.essential
          ? (preview.essentialAllowed.festival?.name ?? null)
          : null,
        preview,
        pickedReceiving,
        typedRequired: typedConfirmationRequired(
          preview.eligible,
          row.essential,
        ),
        env,
        notificationsLaunched,
        problem,
      },
    };
  } catch (error) {
    logComunicadosFailure("[comunicados] send confirmation failed", error);
    return { success: false, message: COUNT_FAILED };
  }
}

/**
 * "Enviar ahora" (D1): starts the send, then drains it after the answer
 * (D9). The work's deadline is counted from the moment the action starts, so
 * the request and the work after it fit together under the function's
 * `maxDuration`.
 */
export async function sendComunicadoNowAction(
  input: unknown,
): Promise<SendComunicadoNowResult> {
  const deadline = Date.now() + SEND_AFTER_DEADLINE_MS;
  const { actor, blocked } = await comunicadosActor();
  if (blocked) return { ...blocked, code: "FORBIDDEN" };
  const parsed = SendNowSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      code: "INVALID",
      message: "No pudimos leer la confirmación. Probá de nuevo.",
    };
  }

  let result: SendNowResult;
  try {
    result = await sendComunicadoNow({ ...parsed.data, by: actor.id });
  } catch (error) {
    if (error instanceof SendRefusal) {
      return { success: false, code: error.code, message: error.message };
    }
    logComunicadosFailure("[comunicados] send failed", error);
    return { success: false, code: "FAILED", message: SEND_FAILED };
  }

  if (result.kind === "already_sent") {
    return {
      success: true,
      alreadySent: true,
      message: "Este comunicado ya se está enviando.",
    };
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
      console.error("[comunicados] send work failed", {
        campaignId,
        errorType: error instanceof Error ? error.name : typeof error,
      });
    }
  });
  revalidatePath(COMUNICADOS_PATH);
  revalidatePath(`${COMUNICADOS_PATH}/${result.comunicadoId}`);
  return { success: true, alreadySent: false, message: "Lo estamos enviando." };
}
