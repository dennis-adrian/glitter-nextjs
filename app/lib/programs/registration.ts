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
  | "sold_out"
  | "already_registered";

export const REGISTRATION_BLOCKER_LABELS: Record<RegistrationBlocker, string> =
  {
    not_purchasable: "Esta sesión no está aceptando inscripciones ahora mismo",
    audience_excluded: "Esta sesión no está disponible para tu perfil",
    not_free: "Esta sesión tiene costo; la inscripción gratuita no aplica",
    sold_out: "Ya no quedan cupos para este horario",
    already_registered: "Ya tienes una entrada para este horario",
  };

export type RegistrationCheckInput = {
  occurrenceState: ResolvedOccurrenceState;
  audience: SessionAudience;
  eligibility: ParticipantEligibility;
  /** Price resolved for this buyer. Only zero routes through free registration. */
  price: number;
  availability: OccurrenceAvailability;
  /** A valid ticket this attendee already holds for this occurrence. */
  hasExistingTicket: boolean;
  waitlistInvitationCoversSeat?: boolean;
};

export type RegistrationCheck =
  | { allowed: true }
  | { allowed: false; blocker: RegistrationBlocker };

/**
 * The full precondition set for a free registration, in the order that gives
 * the most useful message.
 *
 * Ordering matters: audience is checked before availability so an ineligible
 * buyer is told they cannot attend rather than that it is full, and the
 * duplicate check comes last because it is the only one that depends on who the
 * buyer is rather than on the session.
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

  if (!isFreePrice(input.price)) {
    return { allowed: false, blocker: "not_free" };
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
