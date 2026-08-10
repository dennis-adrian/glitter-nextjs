import type {
  OccurrenceLifecycleStatus,
  SessionTicketStatus,
} from "@/app/lib/programs/definitions";

/**
 * What happened when a code was presented at a door.
 *
 * Every value except `checked_in` leaves `session_attendances` untouched, so
 * the outcome is also the answer to "did this scan write anything".
 */
export type CheckInOutcome =
  | "checked_in"
  | "already_used"
  | "wrong_occurrence"
  | "cancelled"
  | "not_found"
  | "occurrence_closed";

/** The ticket a scanned code resolved to, with the context a rejection needs. */
export type CheckInTicket = {
  ticketId: number;
  occurrenceId: number;
  status: SessionTicketStatus;
  attendeeName: string;
  /**
   * The session the ticket *actually* belongs to. Only read on the
   * wrong-occurrence path, where naming the right door is the whole point of
   * the message.
   */
  sessionTitle: string;
  /** Existing attendance, when the ticket has already been through a door. */
  checkedInAt: Date | null;
};

export type CheckInResolutionInput = {
  /** Null when no ticket carries the scanned code. */
  ticket: CheckInTicket | null;
  targetOccurrenceId: number;
  targetLifecycleStatus: OccurrenceLifecycleStatus;
};

export type CheckInResult =
  | { outcome: "checked_in"; attendeeName: string; checkedInAt: Date }
  | { outcome: "already_used"; attendeeName: string; checkedInAt: Date }
  | { outcome: "wrong_occurrence"; sessionTitle: string }
  | { outcome: "cancelled"; attendeeName: string }
  | { outcome: "not_found" }
  | { outcome: "occurrence_closed" };

/** Headline shown on the scanner banner. Details are appended by the caller. */
export const CHECK_IN_OUTCOME_LABELS: Record<CheckInOutcome, string> = {
  checked_in: "Ingreso registrado",
  already_used: "Esta entrada ya fue usada",
  wrong_occurrence: "Esta entrada es para otra sesión",
  cancelled: "Esta entrada fue cancelada",
  not_found: "Código no encontrado",
  occurrence_closed: "Esta sesión fue cancelada",
};

/** Only one outcome means the person may walk in. */
export function isCheckInAccepted(outcome: CheckInOutcome): boolean {
  return outcome === "checked_in";
}

/**
 * Everything decidable before touching `session_attendances`.
 *
 * Returns `null` when the scan survives every check and the caller should
 * attempt the insert — the insert itself, not this function, decides between
 * `checked_in` and `already_used`, because only the unique constraint on
 * `ticketId` settles two operators scanning the same ticket at once
 * (docs/ARCHITECTURE-paid-programs-and-sessions.md §7.3).
 *
 * `checkedInAt` on the ticket is still consulted here so the common,
 * uncontended duplicate is answered without a write attempt; the constraint
 * remains the authority when the read raced.
 */
export function resolveCheckIn(
  input: CheckInResolutionInput,
): CheckInResult | null {
  // The door comes first: a cancelled occurrence admits nobody, so there is no
  // point telling an operator whose ticket it is.
  if (input.targetLifecycleStatus === "cancelled") {
    return { outcome: "occurrence_closed" };
  }

  const { ticket } = input;
  if (!ticket) return { outcome: "not_found" };

  /**
   * Checked before `cancelled` on purpose. Presenting the wrong QR out of an
   * email full of them is the ordinary mistake at a busy door, and naming the
   * right session is the only message that helps. A ticket that is both
   * cancelled and for another session is rare enough that leading with the
   * mismatch costs nothing.
   */
  if (ticket.occurrenceId !== input.targetOccurrenceId) {
    return { outcome: "wrong_occurrence", sessionTitle: ticket.sessionTitle };
  }

  if (ticket.status === "cancelled") {
    return { outcome: "cancelled", attendeeName: ticket.attendeeName };
  }

  if (ticket.checkedInAt) {
    return {
      outcome: "already_used",
      attendeeName: ticket.attendeeName,
      checkedInAt: ticket.checkedInAt,
    };
  }

  return null;
}

/**
 * Normalizes what came off the camera or the fallback input.
 *
 * A QR may be encoded as a full URL by other tooling, and phone keyboards add
 * whitespace, so the last path segment of a URL-shaped payload is taken and
 * everything is trimmed. Codes are 22 base64url characters
 * (`generateTicketCode`), which never contain `/`.
 */
export function normalizeTicketCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const withoutQuery = trimmed.split(/[?#]/)[0];
  const segments = withoutQuery.split("/").filter(Boolean);

  return segments.length > 0 ? segments[segments.length - 1] : "";
}
