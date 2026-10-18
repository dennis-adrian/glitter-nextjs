/**
 * Whether staff may resend a festival ticket email.
 *
 * Pure, like `app/lib/programs/support.ts`, so the dashboard tickets table
 * and the resend action agree on when the action is offerable.
 */

export type TicketResendBlocker =
  | "not_staff"
  | "festival_not_active"
  | "no_ticket_code";

export const TICKET_RESEND_BLOCKER_LABELS: Record<TicketResendBlocker, string> =
  {
    not_staff: "Solo un administrador puede reenviar entradas.",
    festival_not_active:
      "Solo se pueden reenviar entradas del festival activo.",
    no_ticket_code: "Esta entrada no tiene código QR para reenviar.",
  };

export type TicketResendSubject = {
  isStaff: boolean;
  festivalIsActive: boolean;
  ticketNumber: number | null;
};

export type TicketResendCheck =
  | { allowed: true }
  | { allowed: false; blocker: TicketResendBlocker };

/**
 * Checked in this order, so a caller who is not staff learns only that the
 * action is restricted.
 *
 * The festival must be the active one: a ticket for any other festival can
 * no longer get anyone in, so mailing it again only confuses the visitor. A
 * ticket without a number predates numbering and would mail an unscannable
 * code.
 */
export function canResendTicket(
  subject: TicketResendSubject,
): TicketResendCheck {
  if (!subject.isStaff) return { allowed: false, blocker: "not_staff" };
  if (!subject.festivalIsActive) {
    return { allowed: false, blocker: "festival_not_active" };
  }
  if (subject.ticketNumber == null) {
    return { allowed: false, blocker: "no_ticket_code" };
  }

  return { allowed: true };
}

/** The reason shown under a disabled resend action, or undefined if allowed. */
export function getTicketResendDisabledReason(
  subject: TicketResendSubject,
): string | undefined {
  const check = canResendTicket(subject);
  return check.allowed
    ? undefined
    : TICKET_RESEND_BLOCKER_LABELS[check.blocker];
}
