import {
  peopleCountText,
  realSkippedCount,
} from "@/app/components/comunicados/admin/composer/composer-copy";
import type { ComunicadoAudiencePreview } from "@/app/lib/comunicados/audience";
import type { ComunicadoSendConfirmation } from "@/app/lib/comunicados/contracts";
import {
  COMUNICADO_SKIP_REASONS,
  type ComunicadoSkipReasonLabel,
} from "@/app/lib/comunicados/skip-reasons";
import { formatAudienceCount } from "@/app/lib/distribution_lists/definitions";

/**
 * The confirm dialog's sentences (docs/IMPLEMENTATION-comunicados.md G5),
 * built from the numbers the server read when it opened. Kept apart from the
 * component so the grammar can be tested: a clause with nobody in it is left
 * out, and one person reads in the singular.
 */

export type ConfirmRow = { label: string; value: string; strong?: boolean };

export type ConfirmCallout = {
  kind: "essential" | "push" | "environment" | "bell";
  tone: "amber" | "blue" | "neutral";
  text: string;
};

const fmt = formatAudienceCount;

export const LOAD_FAILED_TEXT =
  "No pudimos contar los destinatarios. Probá de nuevo.";
export const SEND_FAILED_TEXT =
  "No pudimos enviarlo. Intentá de nuevo en unos minutos.";
export const SCHEDULE_FAILED_TEXT =
  "No pudimos programarlo. Intentá de nuevo en unos minutos.";
/** The stored draft is not the one this tab confirmed (D-19). */
export const VERSION_CHANGED_TEXT =
  "Este borrador cambió en otra pestaña. Recargá para ver la última versión.";

/** "Enviar…" or "Programar…" (G5): which the dialog confirms. */
export type ConfirmMode = "send" | "schedule";

/** "¿Enviar «…»?" / "¿Programar «…»?"; before the numbers, without a title. */
export function confirmTitle(mode: ConfirmMode, title: string | null) {
  const verb = mode === "schedule" ? "Programar" : "Enviar";
  return title === null ? `¿${verb} este comunicado?` : `¿${verb} «${title}»?`;
}

/** "1 dado de baja", "30 dados de baja". */
function counted(count: number, one: string, many: string) {
  return `${fmt(count)} ${count === 1 ? one : many}`;
}

/**
 * "No lo reciben" counts people by reason, so each label reads as a noun:
 * one, then many. The narrowing's own label is not a reason anyone misses it.
 */
const SKIP_REASON_NOUNS = {
  [COMUNICADO_SKIP_REASONS.not_verified]: [
    "perfil no verificado",
    "perfiles no verificados",
  ],
  [COMUNICADO_SKIP_REASONS.banned]: [
    "cuenta suspendida",
    "cuentas suspendidas",
  ],
  [COMUNICADO_SKIP_REASONS.not_participant]: [
    "no es participante",
    "no son participantes",
  ],
  [COMUNICADO_SKIP_REASONS.deletion_pending]: [
    "cuenta en eliminación",
    "cuentas en eliminación",
  ],
} as const satisfies Record<
  Exclude<ComunicadoSkipReasonLabel, typeof COMUNICADO_SKIP_REASONS.staging>,
  readonly [string, string]
>;

function skipReasonText(reason: string, count: number) {
  if (Object.hasOwn(SKIP_REASON_NOUNS, reason)) {
    const [one, many] =
      SKIP_REASON_NOUNS[reason as keyof typeof SKIP_REASON_NOUNS];
    return counted(count, one, many);
  }
  // A label this list does not know still reads inside the sentence.
  return `${fmt(count)} ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`;
}

/** "1.194 · 30 dados de baja de los anuncios · 4 sin correos masivos…". */
function emailValue({ preview, essential }: ComunicadoSendConfirmation) {
  const { email } = preview;
  const parts = [fmt(email.sendTo)];
  // An essential send reaches them: they are in `sendTo` already.
  if (!essential && email.unsubscribedAnnouncements > 0) {
    parts.push(
      counted(
        email.unsubscribedAnnouncements,
        "dado de baja de los anuncios",
        "dados de baja de los anuncios",
      ),
    );
  }
  if (email.unsubscribedAll > 0) {
    parts.push(`${fmt(email.unsubscribedAll)} sin correos masivos`);
  }
  if (email.suppressed > 0) {
    parts.push(`${fmt(email.suppressed)} con el correo bloqueado`);
  }
  if (email.invalid > 0) {
    parts.push(`${fmt(email.invalid)} con un correo inválido`);
  }
  return parts.join(" · ");
}

/** "352 personas (410 dispositivos)". */
function pushValue(preview: ComunicadoAudiencePreview) {
  const devices = counted(
    preview.pushSubscriptions,
    "dispositivo",
    "dispositivos",
  );
  return `${peopleCountText(preview.pushDevices)} (${devices})`;
}

/** "14 · 8 perfiles no verificados · 4 cuentas suspendidas…". */
function skippedValue(preview: ComunicadoAudiencePreview) {
  const parts = [fmt(realSkippedCount(preview))];
  for (const entry of preview.skipped) {
    if (entry.reason === COMUNICADO_SKIP_REASONS.staging) continue;
    parts.push(skipReasonText(entry.reason, entry.count));
  }
  return parts.join(" · ");
}

/** The dialog's table: who can receive it today, and by which channel. */
export function confirmRows(c: ComunicadoSendConfirmation): ConfirmRow[] {
  const { preview } = c;
  return [
    {
      label: "Pueden recibirlo hoy",
      value: peopleCountText(preview.eligible),
      strong: true,
    },
    { label: "En la app", value: fmt(preview.willReceive) },
    { label: "Por correo", value: c.sendEmail ? emailValue(c) : "No" },
    {
      label: "En el dispositivo",
      value: c.sendPush ? pushValue(preview) : "No",
    },
    { label: "No lo reciben", value: skippedValue(preview) },
  ];
}

/** "a las 4 que pidieron… ni a los 12 correos…": how the clauses join. */
function joinNi(clauses: string[]) {
  if (clauses.length <= 1) return clauses.join("");
  return `${clauses.slice(0, -1).join(", ")} ni ${clauses.at(-1)}`;
}

function essentialText({
  preview,
  essentialReason,
}: ComunicadoSendConfirmation) {
  const { essentialOverride, unsubscribedAll, suppressed } = preview.email;
  const sentences = [
    essentialOverride === 0
      ? "Es un correo esencial: también les llega a quienes se dieron de baja de los anuncios, aunque hoy nadie de esta audiencia lo hizo."
      : essentialOverride === 1
        ? "Es un correo esencial: también le llega a 1 persona que se dio de baja de los anuncios."
        : `Es un correo esencial: también les llega a las ${fmt(essentialOverride)} personas que se dieron de baja de los anuncios.`,
  ];
  const missed: string[] = [];
  if (unsubscribedAll > 0) {
    missed.push(
      unsubscribedAll === 1
        ? "a 1 que pidió no recibir ningún correo masivo"
        : `a las ${fmt(unsubscribedAll)} que pidieron no recibir ningún correo masivo`,
    );
  }
  if (suppressed > 0) {
    missed.push(
      suppressed === 1
        ? "a 1 correo bloqueado por rebote o spam"
        : `a los ${fmt(suppressed)} correos bloqueados por rebote o spam`,
    );
  }
  if (missed.length > 0) {
    sentences.push(
      unsubscribedAll + suppressed === 1
        ? `No le llega ${joinNi(missed)}: lo ve en la app.`
        : `No les llega ${joinNi(missed)}: ellos lo ven en la app.`,
    );
  }
  if (essentialReason) sentences.push(`Motivo: «${essentialReason}».`);
  sentences.push("Queda registrado a tu nombre.");
  return sentences.join(" ");
}

export const PUSH_CALLOUT_TEXT =
  "La notificación en el dispositivo no se puede borrar una vez que llega, aunque después edites o retires el comunicado.";

const DEV_NO_EMAIL = "(en desarrollo no se envían correos)";

/** "Ana Pérez, Luis Rojas", and "y 3 más" past the names the server sent. */
function namesText({
  count,
  names,
}: ComunicadoSendConfirmation["pickedReceiving"]) {
  if (names.length === 0) return null;
  const rest = count - names.length;
  return rest > 0 ? `${names.join(", ")} y ${fmt(rest)} más` : names.join(", ");
}

/**
 * Who it really reaches outside production (B6): the admins stand in for the
 * lists, and people picked by name get it; on a preview with a real email,
 * marked as a test, and in development only in the app.
 */
function environmentText(c: ComunicadoSendConfirmation) {
  if (c.env === "production") return null;
  const { preview, pickedReceiving } = c;
  const development = c.env === "development";
  const picked = pickedReceiving.count;
  const names = namesText(pickedReceiving);
  const one = picked === 1;

  if (!preview.narrowed) {
    // Only people picked by name: no list to stand in for.
    if (picked === 0) return null;
    const who = one
      ? "la persona elegida por nombre lo recibe"
      : `las ${fmt(picked)} personas elegidas por nombre lo reciben`;
    if (development) {
      return `Estás en un entorno de prueba: ${who} en la app ${DEV_NO_EMAIL}.`;
    }
    const how = c.sendEmail ? " con un correo real marcado como prueba" : "";
    return `Estás en un entorno de prueba: ${who}${how}${names ? `: ${names}` : ""}.`;
  }

  // `eligible` counts the people picked by name too, once each; the lists
  // reach the rest, who are who the admins stand in for.
  const listed = Math.max(0, preview.eligible - picked);
  const lists =
    listed === 0
      ? "las listas"
      : listed === 1
        ? "1 persona de las listas"
        : `las ${fmt(listed)} personas de las listas`;
  const admins =
    preview.stagingAdmins === 0
      ? "lo reciben los administradores, pero hoy ninguno puede recibirlo"
      : preview.stagingAdmins === 1
        ? "lo recibe 1 administrador"
        : `lo reciben los ${fmt(preview.stagingAdmins)} administradores`;
  const head = `Estás en un entorno de prueba: en lugar de ${lists}, ${admins}`;

  if (picked === 0) {
    return development ? `${head} ${DEV_NO_EMAIL}.` : `${head}.`;
  }
  if (development) {
    const who = one
      ? "La persona elegida por nombre lo recibe"
      : `Las ${fmt(picked)} personas elegidas por nombre lo reciben`;
    return `${head}. ${who} en la app ${DEV_NO_EMAIL}.`;
  }
  const who = one
    ? "La persona elegida por nombre sí lo recibe"
    : `Las ${fmt(picked)} personas elegidas por nombre sí lo reciben`;
  const how = c.sendEmail ? ", con un correo real marcado como prueba" : "";
  return `${head}. ${who}${how}${names ? `: ${names}` : ""}.`;
}

/** What the admin should know before sending, when it applies (G5). */
export function confirmCallouts(
  c: ComunicadoSendConfirmation,
): ConfirmCallout[] {
  const callouts: ConfirmCallout[] = [];
  if (c.essential) {
    callouts.push({ kind: "essential", tone: "amber", text: essentialText(c) });
  }
  if (c.sendPush) {
    callouts.push({ kind: "push", tone: "neutral", text: PUSH_CALLOUT_TEXT });
  }
  const environment = environmentText(c);
  if (environment) {
    callouts.push({ kind: "environment", tone: "blue", text: environment });
  }
  if (!c.notificationsLaunched) {
    callouts.push({
      kind: "bell",
      tone: "neutral",
      text: c.sendEmail
        ? "Los participantes todavía no ven la campana: les llega solo el correo."
        : "Los participantes todavía no ven la campana: lo van a ver cuando se abra a todos.",
    });
  }
  return callouts;
}

/** "Para confirmar, escribí la cantidad de personas: 1240", no separator. */
export function typedPrompt(eligible: number) {
  return `Para confirmar, escribí la cantidad de personas: ${eligible}`;
}

/** What was typed, as a count: "1.240" and "1 240" read as 1240. */
export function typedCount(typed: string): number | null {
  const digits = typed.replace(/[.\s]/g, "");
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

export function typedMatches(typed: string, eligible: number) {
  return typedCount(typed) === eligible;
}
