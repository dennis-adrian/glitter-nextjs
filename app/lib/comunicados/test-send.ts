"use server";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  COMUNICADO_TEST_SEND_LIMIT,
  COMUNICADO_TEST_SEND_WINDOW_MS,
  maskEmail,
  parseStoredComunicadoAudience,
} from "@/app/lib/comunicados/definitions";
import { renderComunicadoEmail } from "@/app/lib/comunicados/email";
import { validateComunicadoForSend } from "@/app/lib/comunicados/validate";
import { isSuppressed } from "@/app/lib/emails/suppressions";
import { unsubscribeLinks } from "@/app/lib/emails/unsubscribe-links";
import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { isDeliverableEmail } from "@/app/lib/festivals/invitation-helpers";
import { MAX_SERIAL_ID } from "@/app/lib/notifications/definitions";
import { consumeActionRateLimit } from "@/app/lib/rate-limit";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { emailBaseUrlProblem, publicBaseUrl } from "@/app/lib/urls";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { getUserName } from "@/app/lib/users/utils";
import { sendEmail } from "@/app/vendors/resend";
import { assertSent, sendFailureType } from "@/app/vendors/resend-result";
import { db } from "@/db";
import { comunicados, festivals } from "@/db/schema";
import { serverEnv } from "@/env";

const ComunicadoIdSchema = z.number().int().positive().max(MAX_SERIAL_ID);

const NOT_FOUND = "No encontramos este comunicado.";
const FAILED =
  "No pudimos enviarte la prueba. Intentá de nuevo en unos minutos.";

/**
 * The festival an essential draft is for, when its audience is the one
 * "Confirmados" list an essential send allows; otherwise none, and the test
 * copy goes without the essential note, as the send itself would refuse it.
 */
async function essentialFestivalName(audience: unknown) {
  const parsed = parseStoredComunicadoAudience(audience);
  if (
    !parsed ||
    parsed.festivals.length !== 1 ||
    parsed.lists.length > 0 ||
    parsed.people.length > 0
  ) {
    return null;
  }
  const [festival] = await db
    .select({ name: festivals.name })
    .from(festivals)
    .where(eq(festivals.id, parsed.festivals[0]!))
    .limit(1);
  return festival?.name ?? null;
}

/**
 * "Enviarme una prueba" (docs/IMPLEMENTATION-comunicados.md D11): the working
 * copy, checked as a send would check it and rendered by the same renderer,
 * mailed only to the acting admin's own address.
 *
 * It writes no delivery and no inbox row, so it never touches dedupe or the
 * report. The unsubscribe link is real, for the admin's own address, so the
 * opt-out can be tried end to end.
 */
export async function sendComunicadoTestAction(
  comunicadoId: unknown,
): Promise<{ success: boolean; message: string }> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return { success: false, message: "No autorizado." };
  }
  const blocked = await featureFlagGuard("comunicados", actor);
  if (blocked) return blocked;

  const parsed = ComunicadoIdSchema.safeParse(comunicadoId);
  if (!parsed.success) return { success: false, message: NOT_FOUND };

  const allowed = await consumeActionRateLimit({
    key: `comunicado-test:${actor.id}`,
    limit: COMUNICADO_TEST_SEND_LIMIT,
    windowMs: COMUNICADO_TEST_SEND_WINDOW_MS,
  }).catch(() => null);
  if (allowed === null) return { success: false, message: FAILED };
  if (!allowed) {
    return {
      success: false,
      message:
        "Ya te enviaste varias pruebas hace poco. Esperá unos minutos e intentá de nuevo.",
    };
  }

  try {
    const [row] = await db
      .select({
        id: comunicados.id,
        status: comunicados.status,
        title: comunicados.title,
        doc: comunicados.doc,
        actionLabel: comunicados.actionLabel,
        actionPath: comunicados.actionPath,
        audience: comunicados.audience,
        essential: comunicados.essential,
        essentialReason: comunicados.essentialReason,
      })
      .from(comunicados)
      .where(eq(comunicados.id, parsed.data))
      .limit(1);
    if (!row) return { success: false, message: NOT_FOUND };
    // A sent one has revisions, not a working copy to try.
    if (row.status === "sent") {
      return {
        success: false,
        message:
          "Este comunicado ya se envió: la prueba es para borradores y programados.",
      };
    }

    // The test is the email, whatever the channels say.
    const checked = await validateComunicadoForSend({
      title: row.title,
      doc: row.doc,
      actionLabel: row.actionLabel,
      actionPath: row.actionPath,
      essential: row.essential,
      essentialReason: row.essentialReason,
      sendEmail: true,
    });
    if (!checked.ok) return { success: false, message: checked.message };

    const env = serverEnv.VERCEL_ENV;
    const baseUrl = publicBaseUrl();
    const baseProblem = emailBaseUrlProblem(baseUrl, env);
    if (baseProblem) {
      console.error("[comunicados] test send refused:", baseProblem);
      return {
        success: false,
        message:
          "Falta configurar la dirección pública del sitio: los enlaces del correo no funcionarían.",
      };
    }

    const address = actor.email?.trim();
    if (!address || !isDeliverableEmail(address)) {
      return {
        success: false,
        message: "Tu perfil no tiene un correo válido para recibir la prueba.",
      };
    }
    // Resend delivers nothing to an address that bounced or marked us as
    // spam, so the toast would promise a test that never arrives.
    if (await isSuppressed(address)) {
      return {
        success: false,
        message:
          "Tu correo está bloqueado porque rebotó o lo marcaron como spam. Desbloquealo en Correos bloqueados y volvé a intentarlo.",
      };
    }

    const links = unsubscribeLinks(
      { kind: "user", id: actor.id },
      "announcements",
    );
    const email = await renderComunicadoEmail({
      title: checked.title,
      blocks: checked.blocks,
      actionLabel: checked.actionLabel,
      actionPath: checked.actionPath,
      greetingName: getUserName(actor),
      unsubscribeUrl: links.pageUrl,
      essentialFestivalName: row.essential
        ? await essentialFestivalName(row.audience)
        : null,
      staging: env !== "production",
      test: true,
      baseUrl,
    });

    const result = await sendEmail(
      {
        from: email.from,
        to: address,
        replyTo: email.replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: links.headers,
      },
      // Each click is its own test: the same key would 409 an edited body.
      { idempotencyKey: `comunicado-test:${row.id}:${randomUUID()}` },
    );
    assertSent(result);

    if (env === "development") {
      return {
        success: true,
        message:
          "En desarrollo no se envían correos: quedó registrado en la consola.",
      };
    }
    return {
      success: true,
      message: `Te enviamos la prueba a ${maskEmail(address)}.`,
    };
  } catch (error) {
    // The type only: a provider message can echo the address.
    console.error("[comunicados] test send failed", {
      comunicadoId: parsed.data,
      errorType: sendFailureType(error),
    });
    return { success: false, message: FAILED };
  }
}
