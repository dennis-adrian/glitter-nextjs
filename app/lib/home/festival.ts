import {
  festivalDayRuns,
  formatFestivalDayRuns,
} from "@/app/lib/festival-days";
import { formatDisplayDate } from "@/app/lib/formatters";
import type { HubStatus } from "@/app/lib/participations/hub-status";

/**
 * "14 y 15 de noviembre", "14 al 16 de noviembre", "31 de octubre y 1 de
 * noviembre", "18 al 20 y 27 de diciembre": the festival's days as a person
 * says them, in Bolivia time, without bridging a gap between days.
 */
export function formatFestivalDays(
  dates: readonly { startDate: Date }[],
): string {
  return formatFestivalDayRuns(
    festivalDayRuns(dates.map((date) => date.startDate)),
  );
}

/** "faltan 21 días", "falta 1 día", or nothing once it started. */
export function formatDaysLeft(daysLeft: number | null): string | null {
  if (daysLeft == null) return null;
  return daysLeft === 1 ? "falta 1 día" : `faltan ${daysLeft} días`;
}

/**
 * The one sentence Inicio's festival card says about the participation. The
 * card links to Participaciones, which has the rest.
 */
export function participationSentence({
  status,
  reservationsStartDate,
  standLabel,
  categoryName,
  partners,
  blockedUntil = null,
}: {
  status: HubStatus;
  /** When a sanction delay lets them reserve; null for a ban. */
  blockedUntil?: Date | null;
  reservationsStartDate: Date;
  /** "stand B12", once there is a reservation. */
  standLabel: string | null;
  categoryName: string;
  partners: readonly string[];
}): string {
  switch (status) {
    case "pending_enrollment":
      return "Inscribite para participar";
    case "enrollment_pending_approval":
      return "El equipo está revisando tu inscripción";
    case "rejected_enrollment":
      return "Tu inscripción no fue aprobada";
    case "waiting_for_reservations":
      return `Las reservas abren el ${formatDisplayDate(reservationsStartDate, {
        day: "numeric",
        month: "long",
      })}`;
    case "approved_enrollment":
      return "Ya podés reservar tu stand";
    case "no_stands_available":
      return `Los espacios de ${categoryName} se agotaron`;
    case "pending_payment":
      return standLabel ? `Falta pagar tu ${standLabel}` : "Falta pagar tu reserva";
    case "pending_payment_approval":
      return standLabel
        ? `El pago de tu ${standLabel} está en revisión`
        : "El pago de tu reserva está en revisión";
    case "confirmed_reservation": {
      const stand = standLabel
        ? standLabel.charAt(0).toUpperCase() + standLabel.slice(1)
        : "Tu reserva";
      const shared =
        partners.length > 0 ? ` · compartido con ${partners.join(", ")}` : "";
      return `${stand} · ${categoryName}${shared}`;
    }
    case "rejected_reservation":
      return standLabel
        ? `Tu reserva del ${standLabel} fue cancelada`
        : "Tu reserva fue cancelada";
    case "reservations_blocked":
      return blockedUntil
        ? `Podés reservar desde el ${formatDisplayDate(blockedUntil, {
            day: "numeric",
            month: "long",
          })}`
        : "No podés reservar en esta edición";
  }
}
