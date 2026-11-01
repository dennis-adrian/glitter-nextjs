import { peopleCountText } from "@/app/components/comunicados/admin/composer/composer-copy";
import {
  emailSplitText,
  skipReasonText,
} from "@/app/components/comunicados/admin/send-confirm-copy";
import type { ComunicadoResendPreview } from "@/app/lib/comunicados/contracts";
import type { ComunicadoResendSummary } from "@/app/lib/comunicados/definitions";
import { formatAudienceCount } from "@/app/lib/distribution_lists/definitions";

/*
 * "Enviar a más personas" (docs/IMPLEMENTATION-comunicados.md G10): the
 * dialog's sentences and the report's history lines, from the server's
 * numbers. Kept apart from the components so the grammar can be tested.
 */

const fmt = formatAudienceCount;

export const RESEND_BUTTON_LABEL = "Enviar a más personas";
export const RESEND_DIALOG_HINT =
  "Les llega el comunicado tal como está ahora. A quienes ya lo tienen no se lo enviamos de nuevo.";
export const RESEND_LOAD_FAILED_TEXT =
  "No pudimos contar a quiénes les llegaría. Probá de nuevo.";
export const RESEND_FAILED_TEXT =
  "No pudimos enviarlo. Intentá de nuevo en unos minutos.";
export const RESEND_ESSENTIAL_PEOPLE_TEXT =
  "Es un correo esencial: solo se puede enviar a las personas nuevas del festival. Para otras personas, duplicalo.";

type ReadyPreview = Extract<ComunicadoResendPreview, { ok: true }>;

/** "12 personas nuevas en la audiencia desde el envío". */
export function newcomersText(count: number) {
  if (count === 0) return "Nadie nuevo en la audiencia desde el envío";
  return count === 1
    ? "1 persona nueva en la audiencia desde el envío"
    : `${fmt(count)} personas nuevas en la audiencia desde el envío`;
}

/** "Enviar a 15 personas"; before the numbers, "Enviar". */
export function resendActionLabel(preview: ReadyPreview | null) {
  if (!preview) return "Enviar";
  return `Enviar a ${peopleCountText(preview.eligible)}`;
}

/** "en la app, por correo y en el dispositivo". */
export function channelsText(sendEmail: boolean, sendPush: boolean) {
  const parts = ["en la app"];
  if (sendEmail) parts.push("por correo");
  if (sendPush) parts.push("en el dispositivo");
  return parts.length === 1
    ? parts[0]!
    : `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`;
}

/** The dialog's table rows, as "Enviar…" lays them out (G5). */
export function resendRows(
  p: ReadyPreview,
  channels: { sendEmail: boolean; sendPush: boolean },
): { label: string; value: string; strong?: boolean }[] {
  const rows: { label: string; value: string; strong?: boolean }[] = [
    { label: "Le llega a", value: peopleCountText(p.eligible), strong: true },
  ];
  if (p.newcomers > 0 && p.pickedByName > 0) {
    rows.push({
      label: "De ellos",
      value: `${fmt(p.newcomers)} nuevos en la audiencia · ${fmt(p.pickedByName)} por nombre`,
    });
  }
  rows.push({
    label: "Por correo",
    value: channels.sendEmail ? emailSplitText(p.email, p.essential) : "No",
  });
  rows.push({
    label: "En el dispositivo",
    value: channels.sendPush
      ? `${peopleCountText(p.pushDevices)} (${fmt(p.pushSubscriptions)} ${p.pushSubscriptions === 1 ? "dispositivo" : "dispositivos"})`
      : "No",
  });
  const notReceiving = p.notReceiving.reduce((sum, e) => sum + e.count, 0);
  if (notReceiving > 0) {
    rows.push({
      label: "No pueden recibirlo",
      value: [
        fmt(notReceiving),
        ...p.notReceiving.map((e) => skipReasonText(e.reason, e.count)),
      ].join(" · "),
    });
  }
  return rows;
}

/**
 * The essential callouts (B7, G10): an essential resend to the festival's
 * newcomers lifts the Anuncios opt-out as the send did; past the 7-day
 * window it goes out as a normal one.
 */
export function essentialResendText(p: ReadyPreview): string | null {
  if (p.essential) {
    const n = p.email.essentialOverride;
    const reached =
      n === 0
        ? ""
        : n === 1
          ? " También le llega por correo a 1 persona que se dio de baja de los anuncios."
          : ` También les llega por correo a ${fmt(n)} personas que se dieron de baja de los anuncios.`;
    return `Sale como correo esencial, como el envío original.${reached} Queda registrado a tu nombre.`;
  }
  if (p.essentialLapsed) {
    return "El festival terminó hace más de 7 días, así que este envío sale como un comunicado normal: no les llega por correo a quienes se dieron de baja de los anuncios.";
  }
  return null;
}

/** The test-environment callout, when the lists went to the admins (B6). */
export function resendEnvironmentText(p: ReadyPreview): string | null {
  if (!p.narrowed || p.newcomers === 0) return null;
  const people =
    p.newcomers === 1
      ? "la persona nueva de las listas no lo recibe"
      : `las ${fmt(p.newcomers)} personas nuevas de las listas no lo reciben`;
  const admins =
    p.stagingAdmins === 0
      ? ""
      : p.stagingAdmins === 1
        ? "; lo recibe 1 administrador que todavía no lo tenía"
        : `; lo reciben ${fmt(p.stagingAdmins)} administradores que todavía no lo tenían`;
  return `Estás en un entorno de prueba: ${people}${admins}.`;
}

/** "Para confirmar, escribí la cantidad de personas: 15". */
export function resendTypedPrompt(eligible: number) {
  return `Para confirmar, escribí la cantidad de personas: ${eligible}`;
}

/**
 * The report's history (G10): "Enviado a 12 personas más el dom, 25 oct,
 * 10:12 AM por Ana · 9 nuevas en la audiencia · 3 por nombre · en la app y
 * por correo · esencial".
 */
export function resendHistoryLine(entry: {
  moment: string;
  byName: string | null;
  sendEmail: boolean;
  sendPush: boolean;
  essential: boolean;
  summary: ComunicadoResendSummary | null;
}) {
  const s = entry.summary;
  const head = s
    ? `Enviado a ${s.willReceive === 1 ? "1 persona más" : `${fmt(s.willReceive)} personas más`} el ${entry.moment}`
    : `Enviado a más personas el ${entry.moment}`;
  const parts = [entry.byName ? `${head} por ${entry.byName}` : head];
  if (s && s.newcomers > 0) {
    parts.push(
      s.newcomers === 1
        ? "1 nueva en la audiencia"
        : `${fmt(s.newcomers)} nuevas en la audiencia`,
    );
  }
  if (s && s.pickedByName > 0) parts.push(`${fmt(s.pickedByName)} por nombre`);
  if (s && s.stagingSkipped > 0) {
    parts.push(`${fmt(s.stagingSkipped)} de listas no (entorno de prueba)`);
  }
  parts.push(channelsText(entry.sendEmail, entry.sendPush));
  if (entry.essential) parts.push("esencial");
  return parts.join(" · ");
}
