import type { ComunicadoAudiencePreview } from "@/app/lib/comunicados/audience";
import {
  COMUNICADO_ESSENTIAL_REASON_MIN,
  COMUNICADO_MAX_RECIPIENTS,
  COMUNICADO_TEXT_MAX,
} from "@/app/lib/comunicados/definitions";
import { COMUNICADO_SKIP_REASONS } from "@/app/lib/comunicados/skip-reasons";
import { formatAudienceCount } from "@/app/lib/distribution_lists/definitions";

/**
 * The composer's sentences built from numbers (docs/IMPLEMENTATION-comunicados.md
 * G4), kept apart from the components so the grammar can be tested: a clause
 * with nobody in it is left out, and one person reads in the singular.
 */

export type ComposerEnv = "development" | "preview" | "production";

const fmt = formatAudienceCount;

/** "1 persona", "1.240 personas". */
export function peopleCountText(count: number) {
  return count === 1 ? "1 persona" : `${fmt(count)} personas`;
}

/** "· 85 están en más de una lista (cuentan una vez)". */
export function overlapText(count: number) {
  return count === 1
    ? "1 está en más de una lista (cuenta una vez)"
    : `${fmt(count)} están en más de una lista (cuentan una vez)`;
}

/** "1.204/5.000": the text counter, in the server's own measure. */
export function textCounterText(length: number) {
  return `${fmt(length)}/${fmt(COMUNICADO_TEXT_MAX)}`;
}

/**
 * Who does not receive it for a real reason: the preview narrowing's own
 * label is told apart, since on a preview or in development it covers every
 * list member.
 */
export function realSkippedCount(preview: ComunicadoAudiencePreview) {
  const staging = preview.skipped.find(
    (entry) => entry.reason === COMUNICADO_SKIP_REASONS.staging,
  );
  return preview.skippedTotal - (staging?.count ?? 0);
}

/** "a, b ni c": how the "No les llega" clauses join. */
function joinNi(clauses: string[]) {
  if (clauses.length <= 1) return clauses.join("");
  return `${clauses.slice(0, -1).join(", ")} ni ${clauses.at(-1)}`;
}

/**
 * "1.194 de 1.240. No les llega a 30 que se dieron de baja de los anuncios,
 * a 4 que pidieron no recibir ningún correo masivo ni a 12 con el correo
 * bloqueado." The split adds up to who would receive it.
 */
export function emailChannelLine(preview: ComunicadoAudiencePreview) {
  if (preview.willReceive === 0)
    return "Nadie de esta audiencia puede recibirlo.";
  const { email } = preview;
  const clauses: string[] = [];
  if (email.unsubscribedAnnouncements > 0) {
    clauses.push(
      email.unsubscribedAnnouncements === 1
        ? "a 1 que se dio de baja de los anuncios"
        : `a ${fmt(email.unsubscribedAnnouncements)} que se dieron de baja de los anuncios`,
    );
  }
  if (email.unsubscribedAll > 0) {
    clauses.push(
      email.unsubscribedAll === 1
        ? "a 1 que pidió no recibir ningún correo masivo"
        : `a ${fmt(email.unsubscribedAll)} que pidieron no recibir ningún correo masivo`,
    );
  }
  if (email.suppressed > 0) {
    clauses.push(`a ${fmt(email.suppressed)} con el correo bloqueado`);
  }
  if (email.invalid > 0) {
    clauses.push(
      email.invalid === 1
        ? "a 1 con un correo que no es válido"
        : `a ${fmt(email.invalid)} con un correo que no es válido`,
    );
  }
  const head = `${fmt(email.sendTo)} de ${fmt(preview.willReceive)}.`;
  return clauses.length > 0 ? `${head} No les llega ${joinNi(clauses)}.` : head;
}

/** "Solo para algo urgente. Llega a los dispositivos de 352 personas…". */
export function pushChannelLine(pushDevices: number | null) {
  const reach =
    pushDevices === null
      ? "Llega a los dispositivos de quienes las activaron."
      : pushDevices === 0
        ? "Por ahora nadie de esta audiencia las activó en su dispositivo."
        : pushDevices === 1
          ? "Llega al dispositivo de 1 persona que las activó."
          : `Llega a los dispositivos de ${fmt(pushDevices)} personas que las activaron.`;
  return `Solo para algo urgente. ${reach} Una vez que llega no se puede borrar.`;
}

export const PUSH_NOT_LAUNCHED_LINE =
  "Todavía no está abierta a participantes: hoy solo les llegaría a quienes ya la tienen habilitada.";

export const ESSENTIAL_RULE_LINE =
  "Correo esencial: solo para un comunicado a un único «Confirmados · festival» de un festival en curso o próximo, con correo.";

/**
 * The essential switch's help, with today's numbers: whom it reaches despite
 * the Anuncios opt-out, and whom it still does not.
 */
export function essentialHelpText(
  preview: ComunicadoAudiencePreview,
  festivalName: string,
) {
  // Applied, essential moves the Anuncios opt-outs into the send and counts
  // them as overridden; not applied, they are still opted out. One of the two
  // is always zero.
  const optedOut =
    preview.email.essentialOverride + preview.email.unsubscribedAnnouncements;
  return (
    `El correo les llega también a quienes se dieron de baja de los anuncios (${peopleCountText(optedOut)}). ` +
    `No les llega a quienes pidieron no recibir ningún correo masivo (${fmt(preview.email.unsubscribedAll)}) ` +
    `ni a los correos bloqueados (${fmt(preview.email.suppressed)}): ellos lo ven en la app. ` +
    `Usalo solo para algo que cambia su participación en ${festivalName}, como el horario de armado. ` +
    "Queda registrado quién lo marcó y por qué."
  );
}

export const TOO_LARGE_TEXT = `Por ahora un comunicado llega a ${fmt(COMUNICADO_MAX_RECIPIENTS)} personas como máximo. Achicá la audiencia con una lista más precisa.`;

/**
 * On a preview and in development the lists go to the admins instead (B6):
 * how many it would really reach here, and how.
 */
export function narrowedNote(
  preview: ComunicadoAudiencePreview,
  env: ComposerEnv,
  hasPeople: boolean,
) {
  const who = hasPeople
    ? "los administradores en lugar de las listas, y las personas elegidas por nombre"
    : "los administradores en lugar de las listas";
  const reach =
    preview.willReceive === 1
      ? "lo recibiría 1 persona"
      : `lo recibirían ${fmt(preview.willReceive)} personas`;
  const tail =
    env === "development"
      ? " En desarrollo no se envían correos."
      : hasPeople
        ? " Quienes elegiste por nombre reciben un correo real, marcado como prueba."
        : "";
  return `Estás en un entorno de prueba: ${reach}, ${who}.${tail}`;
}

export type ReadinessInput = {
  title: string;
  text: string;
  audienceEmpty: boolean;
  action: { enabled: boolean; label: string; path: string };
  essential: { on: boolean; reason: string };
};

/**
 * Under "Enviar…" and "Guardar cambios…" while an image uploads: until it
 * answers, the text holds it with no address.
 */
export const IMAGE_UPLOADING_TEXT = "Esperá a que termine de subir la imagen.";

/** "Falta un título, el texto, al menos un destinatario." as parts. */
export function missingForSend(input: ReadinessInput): string[] {
  const missing: string[] = [];
  if (!input.title.trim()) missing.push("un título");
  if (!input.text.trim()) missing.push("el texto");
  if (input.audienceEmpty) missing.push("al menos un destinatario");
  if (input.action.enabled) {
    const label = input.action.label.trim();
    const path = input.action.path.trim();
    if (path && !label) missing.push("el texto del botón");
    if (label && !path) missing.push("la página del botón");
  }
  if (
    input.essential.on &&
    input.essential.reason.trim().length < COMUNICADO_ESSENTIAL_REASON_MIN
  ) {
    missing.push("por qué es esencial");
  }
  return missing;
}
