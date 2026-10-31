import type { ComunicadoRetractCounts } from "@/app/lib/comunicados/contracts";
import { formatAudienceCount } from "@/app/lib/distribution_lists/definitions";

/**
 * What "Retirar…" says it does (docs/IMPLEMENTATION-comunicados.md F3, G7),
 * from the report's counts. An email that may have arrived in an earlier
 * attempt counts under "pueden haber llegado", never under "no se envían":
 * skipping it now cannot take it back. A clause with nothing in it is left
 * out: the devices only when the device notification was ticked, and the
 * emails count none when email was not.
 */
export function retractDialogLines(
  counts: ComunicadoRetractCounts,
  { sendPush }: { sendPush: boolean },
): {
  disappears: string;
  emails: string;
} {
  return {
    disappears: disappearsLine(counts.people),
    emails: [
      notSentSentence(counts.queuedEmails, counts.maybeSentEmails),
      cannotDeleteSentence(counts.sentEmails, sendPush),
      "El informe queda guardado.",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function disappearsLine(people: number) {
  if (people === 0) return "No está en las notificaciones de nadie.";
  if (people === 1) {
    return "Desaparece de las notificaciones de la persona, también si ya lo leyó.";
  }
  return `Desaparece de las notificaciones de las ${formatAudienceCount(people)} personas, también de quienes ya lo leyeron.`;
}

/** "Los 8 correos que todavía no salieron no se envían; 3 pueden haber llegado ya." */
function notSentSentence(queued: number, maybeSent: number) {
  if (queued === 0) {
    if (maybeSent === 0) return null;
    return maybeSent === 1
      ? "1 correo puede haber llegado ya."
      : `${formatAudienceCount(maybeSent)} correos pueden haber llegado ya.`;
  }
  const notSent =
    queued === 1
      ? "El correo que todavía no salió no se envía"
      : `Los ${formatAudienceCount(queued)} correos que todavía no salieron no se envían`;
  if (maybeSent === 0) return `${notSent}.`;
  const mayHaveArrived =
    maybeSent === 1
      ? "1 puede haber llegado ya"
      : `${formatAudienceCount(maybeSent)} pueden haber llegado ya`;
  return `${notSent}; ${mayHaveArrived}.`;
}

function cannotDeleteSentence(sent: number, sendPush: boolean) {
  if (sent === 0) {
    return sendPush
      ? "Las notificaciones que ya llegaron a los dispositivos no se pueden borrar."
      : null;
  }
  const emails =
    sent === 1
      ? "El correo ya enviado"
      : `Los ${formatAudienceCount(sent)} correos ya enviados`;
  if (sendPush) {
    return `${emails} y las notificaciones que ya llegaron a los dispositivos no se pueden borrar.`;
  }
  return `${emails} no se ${sent === 1 ? "puede" : "pueden"} borrar.`;
}
