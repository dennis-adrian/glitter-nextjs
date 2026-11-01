import "server-only";

import {
  type AnnouncementBlock,
  normalizeAnnouncementDoc,
} from "@/app/lib/comunicados/content";
import {
  COMUNICADO_EMAIL_HTML_MAX_BYTES,
  COMUNICADO_ESSENTIAL_REASON_MAX,
  COMUNICADO_ESSENTIAL_REASON_MIN,
  ComunicadoActionSchema,
  ComunicadoTitleSchema,
} from "@/app/lib/comunicados/definitions";
import { renderComunicadoEmail } from "@/app/lib/comunicados/email";
import { UNSUBSCRIBE_PAGE_PATH } from "@/app/lib/emails/unsubscribe-links";
import { publicBaseUrl } from "@/app/lib/urls";

/**
 * The send stage of C2 (docs/IMPLEMENTATION-comunicados.md), for a test
 * send, a schedule, a send and an edit: everything about the comunicado
 * itself. Who it goes to is the audience's to check.
 */

export type ComunicadoSendCheckInput = {
  title: string;
  /** The working copy as stored: never trusted, always normalized here. */
  doc: unknown;
  actionLabel: string | null;
  actionPath: string | null;
  essential: boolean;
  essentialReason: string | null;
  /** Without email there is no email to fit under Gmail's clip. */
  sendEmail: boolean;
};

export type ComunicadoSendCheck =
  | {
      ok: true;
      /** Trimmed. */
      title: string;
      blocks: AnnouncementBlock[];
      /** Plain text without URLs, as a revision stores it. */
      text: string;
      actionLabel: string | null;
      actionPath: string | null;
      /** Trimmed; null unless essential. */
      essentialReason: string | null;
    }
  | { ok: false; message: string };

export const COMUNICADO_EMAIL_TOO_LARGE_MESSAGE =
  "El correo quedaría demasiado largo y Gmail lo cortaría. Acortá el texto o sacá alguna imagen.";

/**
 * The longest each per-recipient part can be, so a body measured here fits
 * every recipient's copy: `safeGreetingName` keeps 40 characters, and a
 * signed unsubscribe token is about 105.
 */
const LONGEST_GREETING = "N".repeat(40);
const LONGEST_TOKEN = "t".repeat(160);
const LONGEST_FESTIVAL_NAME = "F".repeat(120);

function essentialReasonProblem(reason: string) {
  if (reason.length < COMUNICADO_ESSENTIAL_REASON_MIN) {
    return `Contá por qué es esencial, en al menos ${COMUNICADO_ESSENTIAL_REASON_MIN} caracteres.`;
  }
  if (reason.length > COMUNICADO_ESSENTIAL_REASON_MAX) {
    return `El motivo puede tener hasta ${COMUNICADO_ESSENTIAL_REASON_MAX} caracteres.`;
  }
  return null;
}

/** The rendered email's size, in bytes, at its largest. */
async function largestEmailBytes(
  title: string,
  blocks: AnnouncementBlock[],
  action: { actionLabel: string | null; actionPath: string | null },
  essential: boolean,
) {
  const baseUrl = publicBaseUrl();
  const { html } = await renderComunicadoEmail({
    title,
    blocks,
    ...action,
    greetingName: LONGEST_GREETING,
    unsubscribeUrl: `${baseUrl}${UNSUBSCRIBE_PAGE_PATH}?token=${LONGEST_TOKEN}`,
    essentialFestivalName: essential ? LONGEST_FESTIVAL_NAME : null,
    staging: true,
    test: false,
    baseUrl,
  });
  return new TextEncoder().encode(html).length;
}

/**
 * Checks a comunicado as it must be to go out, and returns it the way the
 * send writes it. The first problem found is the message, in the order the
 * composer shows its fields; the email is rendered last, only when the rest
 * passed.
 */
export async function validateComunicadoForSend(
  input: ComunicadoSendCheckInput,
): Promise<ComunicadoSendCheck> {
  const title = ComunicadoTitleSchema.safeParse(input.title);
  if (!title.success) {
    return { ok: false, message: title.error.issues[0]!.message };
  }

  const content = normalizeAnnouncementDoc(input.doc, { stage: "send" });
  if (!content.ok) return content;

  const action = ComunicadoActionSchema.safeParse({
    actionLabel: input.actionLabel,
    actionPath: input.actionPath,
  });
  if (!action.success) {
    return { ok: false, message: action.error.issues[0]!.message };
  }

  let essentialReason: string | null = null;
  if (input.essential) {
    essentialReason = input.essentialReason?.trim() ?? "";
    const problem = essentialReasonProblem(essentialReason);
    if (problem) return { ok: false, message: problem };
  }

  if (
    input.sendEmail &&
    (await largestEmailBytes(
      title.data,
      content.blocks,
      action.data,
      input.essential,
    )) > COMUNICADO_EMAIL_HTML_MAX_BYTES
  ) {
    return { ok: false, message: COMUNICADO_EMAIL_TOO_LARGE_MESSAGE };
  }

  return {
    ok: true,
    title: title.data,
    blocks: content.blocks,
    text: content.text,
    actionLabel: action.data.actionLabel,
    actionPath: action.data.actionPath,
    essentialReason,
  };
}
