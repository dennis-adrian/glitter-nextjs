import type { ReservationBase } from "@/app/api/reservations/definitions";

/**
 * The Spanish name of each reservation status, for admin screens.
 *
 * One map for the status badge and the console history, so the two cannot
 * drift into calling the same state different things. Participant screens do
 * not use it: they speak in `participantStatusCopy`, where "Verificación de
 * Pago" is a queue name nobody outside the team should read.
 */
export const RESERVATION_STATUS_LABELS = {
  pending: "Pendiente",
  accepted: "Confirmada",
  verification_payment: "Verificación de Pago",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  released: "Liberada",
} satisfies Record<ReservationBase["status"], string>;

/**
 * The label for any status string, falling back to the raw value.
 *
 * The event log stores statuses as text, so a value this map has never heard
 * of (a status added later, or a legacy row) still renders as what it is
 * rather than as nothing. Own keys only: `constructor` is not a status.
 */
export function reservationStatusLabel(status: string): string {
  return Object.hasOwn(RESERVATION_STATUS_LABELS, status)
    ? RESERVATION_STATUS_LABELS[status as ReservationBase["status"]]
    : status;
}
