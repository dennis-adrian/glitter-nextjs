/**
 * How a reservation's status reads to the person who made it.
 *
 * Pure, so the detail page, the tests, and anything else that has to explain a
 * reservation all say the same thing. The admin tables have their own
 * vocabulary — "Verificación de Pago" is a queue name, not something to tell a
 * participant — which is why this does not reuse them.
 *
 * No penalty language anywhere (PRD §3): a closed reservation is stated as a
 * fact with its consequence, never as an accusation.
 */

export type ParticipantReservationStatus =
  | "pending"
  | "verification_payment"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "released";

export type ReservationStatusTone = "action" | "waiting" | "done" | "closed";

export type ParticipantStatusCopy = {
  label: string;
  /** One line on what the status means, addressed to the participant. */
  description: string;
  /** What they should do now, when there is anything. */
  whatNext: string | null;
  tone: ReservationStatusTone;
  /** Whether the reservation still holds its stand. */
  isLive: boolean;
};

const COPY: Record<ParticipantReservationStatus, ParticipantStatusCopy> = {
  pending: {
    label: "Pendiente de pago",
    description: "Tu espacio está guardado, pero todavía no está confirmado.",
    whatNext: "Completá el pago antes de la fecha límite para confirmarlo.",
    tone: "action",
    isLive: true,
  },
  verification_payment: {
    label: "Pago en revisión",
    description: "Recibimos tu comprobante y lo estamos revisando.",
    whatNext: "No tenés que hacer nada. Te avisamos cuando esté confirmado.",
    tone: "waiting",
    isLive: true,
  },
  accepted: {
    label: "Confirmada",
    description: "Tu espacio está confirmado. ¡Nos vemos en el festival!",
    whatNext: null,
    tone: "done",
    isLive: true,
  },
  rejected: {
    label: "Cerrada",
    description:
      "Esta reserva se cerró y el espacio volvió a estar disponible para otras personas.",
    // Stated plainly rather than softened: someone who does not know they are
    // blocked will keep trying and hit a wall with no explanation.
    whatNext:
      "No vas a poder hacer otra reserva en este festival. Si creés que hay un error, escribinos.",
    tone: "closed",
    isLive: false,
  },
  // Present in the database enum and never written (PRD §9.1). Mapped rather
  // than left to crash, so a stray row renders as what it would mean.
  cancelled: {
    label: "Cerrada",
    description:
      "Esta reserva se cerró y el espacio volvió a estar disponible para otras personas.",
    whatNext:
      "No vas a poder hacer otra reserva en este festival. Si creés que hay un error, escribinos.",
    tone: "closed",
    isLive: false,
  },
  released: {
    label: "Liberada",
    description:
      "Liberaste esta reserva y el espacio volvió al mapa. Los créditos que usaste no se devuelven.",
    whatNext: "Podés hacer una nueva reserva si todavía hay espacios libres.",
    tone: "closed",
    isLive: false,
  },
};

export function participantStatusCopy(
  status: string,
): ParticipantStatusCopy | null {
  return COPY[status as ParticipantReservationStatus] ?? null;
}

/**
 * Whether the owner may give this reservation up for a fee (PRD §9).
 *
 * `pending` only. Every other live status is a question about money rather
 * than about a stand — a voucher under review or a paid reservation would make
 * release a refund — and every closed one is already over.
 *
 * Ownership, festival configuration and the credit balance are checked
 * server-side by the release command; this answers only the status half, which
 * is what the page needs to decide whether to show anything at all.
 */
export function statusAllowsRelease(status: string): boolean {
  return status === "pending";
}
