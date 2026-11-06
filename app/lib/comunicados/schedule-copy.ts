import {
  COMUNICADO_UNTITLED,
  ESSENTIAL_FESTIVAL_GRACE_DAYS,
} from "@/app/lib/comunicados/definitions";
import { formatAudienceCount } from "@/app/lib/distribution_lists/definitions";
import { formatDisplayDate } from "@/app/lib/formatters";

/**
 * What scheduling says (docs/IMPLEMENTATION-comunicados.md E1, E5, E6, G5,
 * G6). Client-safe and pure. Every time is Bolivia's, written the way the
 * rest of the dashboard writes it: "sáb, 31 oct, 9:00 AM".
 */

const MOMENT_FORMAT = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
} as const satisfies Intl.DateTimeFormatOptions;

const LONG_FORMAT = {
  ...MOMENT_FORMAT,
  weekday: "long",
  month: "long",
} as const satisfies Intl.DateTimeFormatOptions;

/** "sáb, 31 oct, 9:00 AM" (formatDisplayDate, weekday/month short, hour numeric, minute 2-digit). */
export function scheduleMomentLabel(at: Date | string): string {
  return formatDisplayDate(at, MOMENT_FORMAT);
}

/** "sábado, 31 de octubre, 9:00 AM" (weekday/month long). */
export function scheduleLongLabel(at: Date | string): string {
  return formatDisplayDate(at, LONG_FORMAT);
}

export const SCHEDULE_DEVELOPMENT_REFUSAL =
  "En desarrollo no se puede programar: nada lo enviaría.";
export const SCHEDULE_TIMEZONE_LABEL = "Horario de Bolivia (La Paz)";
export const SCHEDULE_DIALOG_HINT =
  "Horario de Bolivia (La Paz). Se envía dentro del minuto siguiente a la hora elegida. Si por algún problema se atrasa más de una hora, no se envía y queda como borrador.";
export const SCHEDULE_PREVIEW_NOTE =
  "En el entorno de prueba no corren las tareas programadas: después de la hora elegida tocá «Procesar envíos pendientes».";
export const SCHEDULED_FROZEN_TEXT =
  "Está programado. Para cambiar el texto o los destinatarios, cancelá la programación.";
export const SCHEDULE_STALE_MESSAGE =
  "Este comunicado cambió mientras lo mirabas. Recargá la página.";
/**
 * An essential comunicado whose festival will be past B7's window at the
 * time chosen: the release would refuse it, so the schedule does now.
 */
export const SCHEDULE_ESSENTIAL_TOO_LATE_MESSAGE = `Para esa fecha el festival habrá terminado hace más de ${ESSENTIAL_FESTIVAL_GRACE_DAYS} días: un comunicado esencial tiene que salir antes. Elegí una fecha anterior.`;
export const RESCHEDULE_SENT_MESSAGE = "Ya se empezó a enviar.";
export const RESCHEDULE_NOT_SCHEDULED_MESSAGE =
  "Ya no está programado: volvió a ser un borrador.";
export const CANCEL_SENT_MESSAGE =
  "Ya se empezó a enviar. Si no querés que llegue, retiralo.";
export const CANCEL_ALREADY_DRAFT_MESSAGE =
  "Ya no estaba programado: es un borrador.";
export const CANCELLED_TOAST =
  "Cancelamos la programación: quedó como borrador.";

/** "Programado para el sábado, 31 de octubre, 9:00 AM (hora de Bolivia)" (E5). */
export function scheduledForText(at: Date | string): string {
  return `Programado para el ${scheduleLongLabel(at)} (hora de Bolivia)`;
}

/** "Debería haber salido el sáb, 31 oct, 9:00 AM y todavía no salió." (E6). */
export function overdueText(at: Date | string): string {
  return `Debería haber salido el ${scheduleMomentLabel(at)} y todavía no salió.`;
}

/** "Programar para sáb, 31 oct, 9:00 AM" (G5). */
export function scheduleButtonLabel(at: Date): string {
  return `Programar para ${scheduleMomentLabel(at)}`;
}

/** "La audiencia se calcula al momento del envío: hoy serían 1.240 personas." / "…hoy sería 1 persona." */
export function audienceAtReleaseText(eligible: number): string {
  const today =
    eligible === 1
      ? "sería 1 persona"
      : `serían ${formatAudienceCount(eligible)} personas`;
  return `La audiencia se calcula al momento del envío: hoy ${today}.`;
}

/** "Quedó programado para el sáb, 31 oct, 9:00 AM." */
export function scheduledToast(at: Date): string {
  return `Quedó programado para el ${scheduleMomentLabel(at)}.`;
}

/** "Ahora sale el sáb, 31 oct, 9:00 AM." */
export function rescheduledToast(at: Date): string {
  return `Ahora sale el ${scheduleMomentLabel(at)}.`;
}

/**
 * "Copia de «…». Revisá los destinatarios antes de enviar." (G6). A copy of
 * an untitled draft names it as the list does.
 */
export function copyBannerText(title: string): string {
  return `Copia de «${title.trim() || COMUNICADO_UNTITLED}». Revisá los destinatarios antes de enviar.`;
}
