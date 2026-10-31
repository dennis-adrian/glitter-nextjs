import type { ComunicadoRetryCounts } from "@/app/lib/comunicados/contracts";
import { formatAudienceCount } from "@/app/lib/distribution_lists/definitions";

/*
 * What "Reintentar fallidos" offers and says it does
 * (docs/IMPLEMENTATION-comunicados.md G6), from the report's counts. N is
 * the emails a retry sends again plus the people the fan-out failed for. An
 * email that may have arrived is never retried (V7): it is only named.
 */

/** "Reintentar fallidos (8)"; null when there is nothing to retry. */
export function retryButtonLabel(c: ComunicadoRetryCounts): string | null {
  const n = c.emails + c.people;
  return n === 0 ? null : `Reintentar fallidos (${formatAudienceCount(n)})`;
}

/**
 * "Reintentamos 6 correos y 2 personas que no llegaron a recibirlo, con el
 * texto actual. No reintentamos los 3 correos que pueden haber llegado."
 */
export function retryDialogText(c: ComunicadoRetryCounts): string {
  const retried = [emailsPart(c.emails), peoplePart(c.people)].filter(
    (part) => part !== null,
  );
  return [
    retried.length === 0
      ? "No hay nada para reintentar."
      : `Reintentamos ${retried.join(" y ")}, con el texto actual.`,
    maybeSentSentence(c.maybeSentEmails),
  ]
    .filter(Boolean)
    .join(" ");
}

function emailsPart(emails: number) {
  if (emails === 0) return null;
  return emails === 1 ? "1 correo" : `${formatAudienceCount(emails)} correos`;
}

function peoplePart(people: number) {
  if (people === 0) return null;
  return people === 1
    ? "1 persona que no llegó a recibirlo"
    : `${formatAudienceCount(people)} personas que no llegaron a recibirlo`;
}

function maybeSentSentence(maybeSent: number) {
  if (maybeSent === 0) return null;
  return maybeSent === 1
    ? "No reintentamos el correo que puede haber llegado."
    : `No reintentamos los ${formatAudienceCount(maybeSent)} correos que pueden haber llegado.`;
}
