import type { ParticipantEligibility } from "@/app/lib/programs/eligibility";
import { canPurchaseAudience } from "@/app/lib/programs/eligibility";
import type { SessionAudience } from "@/app/lib/programs/definitions";
import {
  canReserve,
  type OccurrenceAvailability,
} from "@/app/lib/programs/inventory";
import { isFreePrice } from "@/app/lib/programs/pricing";
import type { ResolvedOccurrenceState } from "@/app/lib/programs/state";

/**
 * Why a registration cannot proceed. Every rejection is a named case rather
 * than a bare boolean, so the caller reports the actual reason instead of a
 * generic failure — and so the transaction and the page agree on what happened.
 */
export type RegistrationBlocker =
  | "not_purchasable"
  | "audience_excluded"
  | "not_free"
  | "not_paid"
  | "sold_out"
  | "already_registered";

export const REGISTRATION_BLOCKER_LABELS: Record<RegistrationBlocker, string> =
  {
    not_purchasable: "Esta sesión no está aceptando inscripciones ahora mismo",
    audience_excluded: "Esta sesión no está disponible para tu perfil",
    not_free: "Esta sesión tiene costo; la inscripción gratuita no aplica",
    not_paid: "Esta sesión es gratuita; no necesitas pagar para inscribirte",
    sold_out: "Ya no quedan cupos para este horario",
    already_registered: "Ya tienes una entrada para este horario",
  };

/**
 * Which checkout the caller is attempting. The price is re-resolved server-side
 * either way, so this is what stops a paid session being taken through the free
 * path — and a free one through the paid path, which would otherwise create a
 * hold and demand a voucher for a zero total.
 */
export type RegistrationMode = "free" | "paid";

export type RegistrationCheckInput = {
  occurrenceState: ResolvedOccurrenceState;
  audience: SessionAudience;
  eligibility: ParticipantEligibility;
  /** Price resolved for this buyer, matched against `mode`. */
  price: number;
  availability: OccurrenceAvailability;
  /** A valid ticket this attendee already holds for this occurrence. */
  hasExistingTicket: boolean;
  waitlistInvitationCoversSeat?: boolean;
  /** Defaults to `free` so existing free-registration callers are unchanged. */
  mode?: RegistrationMode;
};

export type RegistrationCheck =
  | { allowed: true }
  | { allowed: false; blocker: RegistrationBlocker };

/**
 * The full precondition set for taking a seat, in the order that gives the most
 * useful message. Shared by free registration and paid checkout: the two differ
 * only in which price they accept, so they must not drift on anything else.
 *
 * Ordering matters: audience is checked first so an ineligible buyer is told
 * they cannot attend rather than that it is full, and the duplicate check runs
 * before availability so a returning buyer is told they already have a ticket
 * rather than that the session is sold out.
 *
 * This runs twice — once to render the page, once inside the confirming
 * transaction — so a stale page cannot smuggle a registration past a rule.
 */
export function resolveRegistrationCheck(
  input: RegistrationCheckInput,
): RegistrationCheck {
  if (!input.occurrenceState.isPurchasable) {
    return { allowed: false, blocker: "not_purchasable" };
  }

  if (!canPurchaseAudience(input.audience, input.eligibility)) {
    return { allowed: false, blocker: "audience_excluded" };
  }

  const free = isFreePrice(input.price);

  if ((input.mode ?? "free") === "free") {
    if (!free) return { allowed: false, blocker: "not_free" };
  } else if (free) {
    return { allowed: false, blocker: "not_paid" };
  }

  if (input.hasExistingTicket) {
    return { allowed: false, blocker: "already_registered" };
  }

  if (
    !canReserve(input.availability, 1, {
      waitlistInvitationCoversSeat: input.waitlistInvitationCoversSeat,
    })
  ) {
    return { allowed: false, blocker: "sold_out" };
  }

  return { allowed: true };
}

/**
 * Attendee identity written onto the ticket. Snapshotted rather than joined so
 * a check-in list still works for guests and survives a later profile edit.
 */
export type AttendeeIdentity = {
  userId: number | null;
  name: string;
  email: string;
};

export function resolveAttendeeIdentity(
  profile: {
    id: number;
    email: string;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null,
  guest: { name: string; email: string } | null,
): AttendeeIdentity | null {
  if (profile) {
    const fullName = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      userId: profile.id,
      name: profile.displayName?.trim() || fullName || profile.email,
      email: profile.email,
    };
  }

  if (guest) {
    return { userId: null, name: guest.name.trim(), email: guest.email.trim() };
  }

  return null;
}

/**
 * Whether a database error is the partial unique index on
 * `(occurrenceId, lower(attendeeEmail))` — "one person, one seat per
 * occurrence" firing across purchases.
 *
 * Both the free-registration insert and the approval issuance can hit it, so
 * the detector lives here rather than in either action. Walks the `cause`
 * chain because drizzle wraps the driver error.
 */
export function isDuplicateAttendeeTicketError(error: unknown): boolean {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const code = Reflect.get(current, "code");
    const constraint = Reflect.get(current, "constraint");
    if (
      code === "23505" &&
      typeof constraint === "string" &&
      constraint.includes("session_tickets_occurrence_attendee")
    ) {
      return true;
    }
    current = Reflect.get(current, "cause");
  }
  return false;
}
