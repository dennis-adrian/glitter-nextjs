import type { ComunicadoRetractCounts } from "@/app/lib/comunicados/contracts";
import { formatAudienceCount } from "@/app/lib/distribution_lists/definitions";

/**
 * What the edit page and "¿Guardar los cambios?" say
 * (docs/IMPLEMENTATION-comunicados.md F1, F2, G7), kept apart from the
 * components so the grammar can be tested. The dialog's numbers are the
 * report's, as "Retirar…" reads them: an email that may have arrived in an
 * earlier attempt is never promised the new text.
 */

const fmt = formatAudienceCount;

export const EDIT_BACK_LABEL = "Volver al comunicado";

export const EDIT_BANNER_TEXT =
  "Estás editando un comunicado enviado. Podés cambiar el título, el texto y el botón. Los destinatarios y los canales quedan como están.";

/** The server's own refusal (F1), shown while the note is empty. */
export const EDIT_NOTE_REQUIRED_TEXT =
  "Contá por qué cambia un correo esencial (lo ve solo el equipo).";

/** When the save could not be asked at all. */
export const EDIT_SAVE_FAILED_TEXT =
  "No pudimos guardar los cambios. Probá de nuevo.";

export const EDIT_DIALOG_TITLE = "¿Guardar los cambios?";

/** "Nota del cambio (…)": required on an essential comunicado (F1). */
export function editNoteLabel(essential: boolean) {
  return essential
    ? "Nota del cambio (obligatoria en un correo esencial, solo para el equipo)"
    : "Nota del cambio (opcional, solo para el equipo)";
}

export type EditDialogLines = {
  inbox: string;
  emails: string | null;
  devices: string | null;
  sending: string | null;
  /** The amber callout, repeated from the composer (F1). */
  essential: string | null;
  advice: string;
};

/**
 * "¿Guardar los cambios?" (G7): where the new text shows, which emails
 * still take it, and what stays as it arrived. A clause with nothing in it
 * is left out, and one reads in the singular.
 */
export function editDialogLines(i: {
  counts: ComunicadoRetractCounts;
  sendEmail: boolean;
  sendPush: boolean;
  sending: boolean;
  essential: boolean;
}): EditDialogLines {
  return {
    inbox: inboxLine(i.counts.people),
    emails: i.sendEmail ? emailsLine(i.counts) : null,
    devices: i.sendPush
      ? "Las notificaciones que ya llegaron a los dispositivos no cambian."
      : null,
    sending: i.sending
      ? "Todavía se está enviando: quienes no lo recibieron aún reciben directamente la versión nueva."
      : null,
    essential: i.essential
      ? "Es un correo esencial: los correos que todavía no salieron llegan con el texto nuevo también a quienes se dieron de baja de los anuncios. Contá por qué en la nota."
      : null,
    advice:
      "Si el cambio es importante para quienes ya lo leyeron, mejor enviá un comunicado nuevo.",
  };
}

function inboxLine(people: number) {
  if (people === 0) {
    return "Todavía no llegó a las notificaciones de nadie: quienes lo reciban verán la versión nueva.";
  }
  if (people === 1) {
    return "Se actualiza en la notificación de la persona y se marca como «Editado».";
  }
  return `Se actualiza en las notificaciones de las ${fmt(people)} personas y se marca como «Editado».`;
}

/**
 * "Correos: los 1.180 que ya salieron no cambian; los 8 que todavía no
 * salieron se envían con el texto nuevo, salvo los que pueden haber llegado
 * ya en un intento anterior." A held batch is sent again under its old key
 * (F1 step 6), so what may have arrived keeps the old text.
 */
function emailsLine(counts: ComunicadoRetractCounts) {
  const halves: string[] = [];
  if (counts.sentEmails > 0) {
    halves.push(
      counts.sentEmails === 1
        ? "el correo que ya salió no cambia"
        : `los ${fmt(counts.sentEmails)} que ya salieron no cambian`,
    );
  }
  if (counts.queuedEmails > 0) {
    const queued =
      counts.queuedEmails === 1
        ? "el correo que todavía no salió se envía con el texto nuevo"
        : `los ${fmt(counts.queuedEmails)} que todavía no salieron se envían con el texto nuevo`;
    halves.push(
      counts.maybeSentEmails > 0
        ? `${queued}, salvo los que pueden haber llegado ya en un intento anterior`
        : queued,
    );
  }
  return halves.length === 0 ? null : `Correos: ${halves.join("; ")}.`;
}
