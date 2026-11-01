import "server-only";

import { render } from "react-email";

import ComunicadoEmail, {
  comunicadoFooterNotes,
  comunicadoGreeting,
} from "@/app/emails/comunicado";
import { comunicadoActionUrl } from "@/app/emails/comunicado-blocks";
import type { AnnouncementBlock } from "@/app/lib/comunicados/content";
import { announcementBlocksToText } from "@/app/lib/comunicados/text";
import { getEnvLabel } from "@/app/lib/config";
import { safeGreetingName } from "@/app/lib/festivals/invitation-helpers";

/**
 * A comunicado's email as one recipient gets it
 * (docs/IMPLEMENTATION-comunicados.md H3, D7): the payload fields every
 * sender shares. The caller adds the address, the headers and the key.
 */

/** The verified domain, a local part of its own: no DNS change (K3, K4). */
export const COMUNICADOS_FROM =
  "Productora Glitter <anuncios@productoraglitter.com>";
/** Outside production, so a test copy never reads as the real thing. */
export const COMUNICADOS_FROM_STAGING =
  "Productora Glitter (prueba) <anuncios@productoraglitter.com>";
/** Replies reach support, as order emails do. */
export const COMUNICADOS_REPLY_TO = "soporte@productoraglitter.com";

/**
 * "[Prev] [Prueba] Cambio de horario de armado": the environment label
 * outside production, then "[Prueba]" on a test send, then the title.
 */
export function comunicadoEmailSubject(
  title: string,
  opts: { test: boolean; envLabel: string },
) {
  return [opts.envLabel, opts.test ? "[Prueba]" : "", title.trim()]
    .filter(Boolean)
    .join(" ");
}

export type ComunicadoEmailInput = {
  title: string;
  /** As `normalizeAnnouncementDoc` returned them. */
  blocks: AnnouncementBlock[];
  actionLabel: string | null;
  actionPath: string | null;
  /**
   * The recipient's name as stored (`getUserName`): it goes through
   * `safeGreetingName` here, so anything that is not plainly a name greets
   * with "¡Hola!".
   */
  greetingName: string | null;
  unsubscribeUrl: string;
  /** Set on an essential send only. */
  essentialFestivalName?: string | null;
  /** Any environment but production: the From name, subject and note (D7). */
  staging: boolean;
  /** "[Prueba]" in the subject. */
  test: boolean;
  /** `publicBaseUrl()`, which the caller has already checked. */
  baseUrl: string;
};

export type RenderedComunicadoEmail = {
  from: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * The text part: the greeting, the title and the text with its URLs, the
 * button as "Ver mi reserva: https://…", the footer notes, then the
 * unsubscribe link.
 */
function textPart(
  input: ComunicadoEmailInput,
  greetingName: string | null,
  actionUrl: string | null,
) {
  const label = input.actionLabel?.trim();
  return [
    comunicadoGreeting(greetingName),
    input.title.trim(),
    announcementBlocksToText(input.blocks, {
      withUrls: true,
      baseUrl: input.baseUrl,
    }),
    label && actionUrl ? `${label}: ${actionUrl}` : "",
    ...comunicadoFooterNotes(input),
    `Darme de baja: ${input.unsubscribeUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function renderComunicadoEmail(
  input: ComunicadoEmailInput,
): Promise<RenderedComunicadoEmail> {
  const greetingName = safeGreetingName(input.greetingName);
  const actionUrl = comunicadoActionUrl(input.actionPath, input.baseUrl);
  const html = await render(
    ComunicadoEmail({
      greetingName,
      title: input.title.trim(),
      blocks: input.blocks,
      actionLabel: input.actionLabel,
      actionPath: input.actionPath,
      unsubscribeUrl: input.unsubscribeUrl,
      essentialFestivalName: input.essentialFestivalName,
      staging: input.staging,
      baseUrl: input.baseUrl,
    }),
  );

  return {
    from: input.staging ? COMUNICADOS_FROM_STAGING : COMUNICADOS_FROM,
    replyTo: COMUNICADOS_REPLY_TO,
    subject: comunicadoEmailSubject(input.title, {
      test: input.test,
      envLabel: input.staging ? getEnvLabel() : "",
    }),
    html,
    text: textPart(input, greetingName, actionUrl),
  };
}
