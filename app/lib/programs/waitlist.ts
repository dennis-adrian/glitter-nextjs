/**
 * Who may join a waitlist, and when an invitation still counts.
 *
 * Pure, like `vouchers.ts` and `review.ts`, so the session page, the join
 * action, and the checkout that honours an invitation all evaluate the same
 * rules. The action is the one that counts — a page is always slightly stale.
 *
 * See docs/ARCHITECTURE-paid-programs-and-sessions.md §7.4.
 */

import type { OccurrenceAvailability } from "@/app/lib/programs/inventory";
import type { ResolvedOccurrenceState } from "@/app/lib/programs/state";

export type WaitlistJoinBlocker =
  | "not_on_sale"
  | "seats_available"
  | "already_registered"
  | "already_waiting";

export const WAITLIST_JOIN_BLOCKER_LABELS: Record<WaitlistJoinBlocker, string> =
  {
    not_on_sale: "Este horario no está aceptando inscripciones ahora mismo",
    seats_available: "Todavía hay cupos: puedes inscribirte directamente",
    already_registered: "Ya tienes una entrada para este horario",
    already_waiting: "Ya estás en la lista de espera de este horario",
  };

export type WaitlistJoinInput = {
  occurrenceState: ResolvedOccurrenceState;
  availability: OccurrenceAvailability;
  /** A valid ticket this person already holds for this occurrence. */
  hasExistingTicket: boolean;
  /** A non-removed entry they already have. */
  isAlreadyWaiting: boolean;
};

export type WaitlistJoinCheck =
  | { allowed: true }
  | { allowed: false; blocker: WaitlistJoinBlocker };

/**
 * The waitlist exists for people who could not buy. Offering it while seats
 * remain would collect names for a queue that never forms, so a free seat is a
 * blocker rather than a courtesy.
 *
 * Ordering: the duplicate checks come last so someone already on the list is
 * told that, rather than being told the session is open.
 */
export function resolveWaitlistJoin(
  input: WaitlistJoinInput,
): WaitlistJoinCheck {
  if (!input.occurrenceState.isPurchasable) {
    return { allowed: false, blocker: "not_on_sale" };
  }

  if (input.hasExistingTicket) {
    return { allowed: false, blocker: "already_registered" };
  }

  if (input.isAlreadyWaiting) {
    return { allowed: false, blocker: "already_waiting" };
  }

  if (input.availability.remaining > 0) {
    return { allowed: false, blocker: "seats_available" };
  }

  return { allowed: true };
}

export type InvitationBlocker = "not_live" | "expired" | "entry_closed";

export const INVITATION_BLOCKER_LABELS: Record<InvitationBlocker, string> = {
  not_live: "Esta invitación ya no está activa",
  expired: "Esta invitación expiró",
  entry_closed: "Ya no estás en la lista de espera de este horario",
};

export type InvitationSubject = {
  status: "sent" | "converted" | "expired" | "revoked";
  expiresAt: Date;
  entryStatus: "waiting" | "invited" | "converted" | "removed";
};

export type InvitationCheck =
  | { allowed: true }
  | { allowed: false; blocker: InvitationBlocker };

/**
 * Whether an invitation can still be used to buy the seat it was issued for.
 *
 * Expiry is evaluated here rather than trusted from the stored status, so an
 * invitation stops working the instant its deadline passes — with or without
 * the sweep having run. The sweep only makes the row's status catch up.
 */
export function resolveInvitationUse(
  invitation: InvitationSubject,
  now: Date = new Date(),
): InvitationCheck {
  if (invitation.status !== "sent") {
    return { allowed: false, blocker: "not_live" };
  }

  if (invitation.expiresAt.getTime() <= now.getTime()) {
    return { allowed: false, blocker: "expired" };
  }

  // A removed entry means the person withdrew or an admin took them off the
  // list; the invitation they still hold must not outlive that.
  if (invitation.entryStatus === "removed") {
    return { allowed: false, blocker: "entry_closed" };
  }

  return { allowed: true };
}

/**
 * How long an invitation stays open.
 *
 * Program override first, global default second — the same resolution order
 * every program-scoped setting uses. This is the resolution of PRD open
 * note §17.5.
 */
export function resolveInvitationWindowMinutes(
  program: { waitlistInvitationWindowMinutes: number | null },
  settings: { defaultWaitlistInvitationWindowMinutes: number },
): number {
  return (
    program.waitlistInvitationWindowMinutes ??
    settings.defaultWaitlistInvitationWindowMinutes
  );
}

/**
 * Whether an error is the unique-index violation for "already on this list".
 *
 * `joinWaitlist` locks the occurrence before it checks, so two concurrent joins
 * by the same person serialize and the second one sees the first's row. This is
 * the layer underneath that: the partial unique indexes on
 * `session_waitlist_entries` are what actually guarantee it, and a violation
 * means the state the buyer should be told about — not the outage that the
 * generic message implies. Mirrors `isDuplicateAttendeeTicketError`.
 */
export function isDuplicateWaitlistEntryError(error: unknown): boolean {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const code = Reflect.get(current, "code");
    const constraint = Reflect.get(current, "constraint");
    if (
      code === "23505" &&
      typeof constraint === "string" &&
      constraint.includes("session_waitlist_entries_occurrence")
    ) {
      return true;
    }
    current = Reflect.get(current, "cause");
  }
  return false;
}
