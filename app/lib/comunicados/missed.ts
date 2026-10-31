import type { SendRefusalCode } from "@/app/lib/comunicados/contracts";
import {
  COMUNICADO_MAX_RECIPIENTS,
  type ComunicadoMissedReason,
} from "@/app/lib/comunicados/definitions";
import { formatAudienceCount } from "@/app/lib/distribution_lists/definitions";

/**
 * What a release that did not send records (docs/IMPLEMENTATION-comunicados.md
 * E4, G9): the missed reason for each refusal, and the clause the bell item
 * and the draft's banner splice into "Al enviarlo, {detalle}. Quedó como
 * borrador.". Pure: the release and its tests share it.
 */

/** `comunicado_not_sent.detail` holds at most this much. */
const DETAIL_MAX = 300;

const MISSED_REASONS = {
  LATE: "late",
  AUDIENCE_TOO_LARGE: "too_large",
  NO_ELIGIBLE_RECIPIENTS: "empty",
  SENDER_NOT_ADMIN: "sender_not_admin",
  INVALID_CONTENT: "invalid",
  INVALID_AUDIENCE: "invalid",
  ESSENTIAL_NOT_ALLOWED: "invalid",
  BASE_URL: "invalid",
  // Not a miss: the row changed under the claim, or a typed count, which a
  // release never compares. The release treats them as unexpected errors
  // and leaves the comunicado scheduled.
  NOT_FOUND: null,
  STALE: null,
  AUDIENCE_CHANGED: null,
} as const satisfies Record<SendRefusalCode, ComunicadoMissedReason | null>;

/** The reason a refused release records, or null when it is not a miss. */
export function missedReasonOf(
  code: SendRefusalCode,
): ComunicadoMissedReason | null {
  return MISSED_REASONS[code];
}

function withoutFinalPeriod(text: string) {
  return text.trim().replace(/\.$/u, "");
}

/**
 * A refusal's sentence as a clause: its first part, up to a ";" or the end
 * of the first sentence, with no final period, and lower-cased only when it
 * starts with a capitalized word ("La lista…", never "URL…"). "La lista «X»
 * tiene un filtro que ya no se puede leer; editala." gives "la lista «X»
 * tiene un filtro que ya no se puede leer".
 */
export function refusalClause(sentence: string): string {
  const first = withoutFinalPeriod(sentence.trim().split(/;|\.\s/u)[0]!);
  return /^\p{Lu}\p{Ll}/u.test(first)
    ? first[0]!.toLowerCase() + first.slice(1)
    : first;
}

/** Cut on a word boundary so the result, "…" included, fits `max`. */
function clip(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.]+$/u, "")}…`;
}

/**
 * The bell's `detail` for a refusal that has one (G9), at most 300
 * characters; null for the reasons whose body says it all.
 */
export function missedDetailOf({
  code,
  message,
  eligible,
}: {
  code: SendRefusalCode;
  message: string;
  eligible: number | null;
}): string | null {
  switch (code) {
    case "AUDIENCE_TOO_LARGE":
      return eligible === null
        ? null
        : `la audiencia sumaba ${formatAudienceCount(eligible)} personas y el máximo es ${formatAudienceCount(COMUNICADO_MAX_RECIPIENTS)}`;
    case "ESSENTIAL_NOT_ALLOWED":
      // A scheduled comunicado is frozen: only its festival can have changed.
      return "el festival ya terminó y no puede ser esencial";
    case "BASE_URL":
      return "falta configurar la dirección pública del sitio, así que los enlaces del correo no funcionarían";
    case "INVALID_AUDIENCE":
      return clip(refusalClause(message), DETAIL_MAX);
    case "INVALID_CONTENT": {
      const before = "el contenido no se pudo validar («";
      const after = "»)";
      const quoted = clip(
        withoutFinalPeriod(message),
        DETAIL_MAX - before.length - after.length,
      );
      return `${before}${quoted}${after}`;
    }
    default:
      return null;
  }
}
