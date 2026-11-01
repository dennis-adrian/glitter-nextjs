import { formatDisplayDate } from "@/app/lib/formatters";
import type { HubStatus } from "@/app/lib/participations/hub-status";

/**
 * "14 y 15 de noviembre", "14 al 16 de noviembre", "31 de octubre y 1 de
 * noviembre": the festival's days as a person says them, in Bolivia time.
 */
export function formatFestivalDays(
  dates: readonly { startDate: Date }[],
): string {
  const days = [...dates]
    .map((date) => date.startDate)
    .sort((a, b) => a.getTime() - b.getTime());
  if (days.length === 0) return "";

  const day = (date: Date) => formatDisplayDate(date, { day: "numeric" });
  const month = (date: Date) => formatDisplayDate(date, { month: "long" });
  const first = days[0];
  const last = days[days.length - 1];

  if (days.length === 1) return `${day(first)} de ${month(first)}`;
  const joiner = days.length === 2 ? "y" : "al";
  if (month(first) === month(last)) {
    return `${day(first)} ${joiner} ${day(last)} de ${month(last)}`;
  }
  return `${day(first)} de ${month(first)} ${joiner} ${day(last)} de ${month(last)}`;
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
}: {
  status: HubStatus;
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
      return "Tu reserva fue rechazada";
  }
}
