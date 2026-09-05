import { occupiesStandCapacity } from "@/app/lib/reservations/policy";

/**
 * Whether a reservation can take a late partner at all (PRD §8.1).
 *
 * Pure, and shared by the page that offers the action and the command that
 * performs it, so the button and the server cannot disagree about who is
 * eligible. The command still re-runs this under locks — everything here can
 * change between rendering and confirming.
 *
 * Deliberately excludes partner eligibility, which is about the other person
 * and needs the database: `assertReservationPartner` owns that.
 */
export type LatePartnerBlockReason =
  | "not_owner"
  | "not_illustration"
  | "not_live"
  | "already_shared"
  | "deadline_passed"
  | "no_deadline";

export type LatePartnerAvailabilityInput = {
  isOwner: boolean;
  standCategory: string;
  reservationStatus: string;
  registeredParticipantCount: number;
  /** Null when the festival has neither a start date nor an override (§5). */
  effectiveDeadlineAt: Date | null;
  now: Date;
};

/** Null when the action is available; otherwise why it is not. */
export function latePartnerBlockReason(
  input: LatePartnerAvailabilityInput,
): LatePartnerBlockReason | null {
  if (!input.isOwner) return "not_owner";
  if (input.standCategory !== "illustration") return "not_illustration";

  // "Live" is the occupancy predicate, not "unpaid": a partner may be added to
  // a reservation that is already paid for, which is the whole reason the
  // shared-price difference is charged separately (§6.2). This is where late
  // partner and release deliberately differ — release is `pending` only,
  // because giving back a paid stand is a refund question.
  if (!occupiesStandCapacity(input.reservationStatus)) return "not_live";

  if (input.registeredParticipantCount !== 1) return "already_shared";

  // A festival with no start date and no override has no deadline to compute,
  // and an open-ended one would let somebody add a partner the day before the
  // doors open. Unavailable rather than unlimited (§5).
  if (!input.effectiveDeadlineAt) return "no_deadline";
  if (input.effectiveDeadlineAt.getTime() <= input.now.getTime()) {
    return "deadline_passed";
  }

  return null;
}

/**
 * Whether the reason should hide the feature outright rather than explain it.
 *
 * §8.1 is explicit that at or after the deadline the feature is hidden, not
 * shown disabled: advertising an action that can no longer finish, next to a
 * price, invites somebody to buy credits for it. The same goes for a
 * reservation that already has two people — there is nothing to offer.
 *
 * This is the one place the house rule of disabling rather than hiding gives
 * way, and only because the alternative is selling something undeliverable.
 */
export function shouldHideLatePartner(
  reason: LatePartnerBlockReason | null,
): boolean {
  return reason !== null;
}
