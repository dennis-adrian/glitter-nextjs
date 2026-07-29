import type { SessionPurchaseStatus } from "@/app/lib/programs/definitions";

/**
 * Availability is derived, never stored.
 *
 *   occupied = valid tickets + lines whose purchase is still holding a seat
 *   remaining = capacity - occupied
 *
 * Nothing is ever decremented, so "release" is a status transition rather than
 * arithmetic — which is why double release is not representable, and why an
 * abandoned hold frees its seat the instant its deadline passes, with or
 * without the sweep having run.
 *
 * See docs/ARCHITECTURE-paid-programs-and-sessions.md §9.
 */

/**
 * Purchase statuses that occupy a seat indefinitely: the buyer has paid and is
 * waiting on review, so the hold no longer expires.
 */
export const HOLDING_STATUSES: SessionPurchaseStatus[] = [
  "under_verification",
  "changes_requested",
];

/**
 * Whether a purchase line still occupies a seat.
 *
 * `approved` is deliberately absent: an approved purchase occupies its seats
 * through its issued tickets, and counting it here as well would double count.
 */
export function isHoldingSeat(
  purchase: { status: SessionPurchaseStatus; holdExpiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (HOLDING_STATUSES.includes(purchase.status)) return true;

  return (
    purchase.status === "pending_upload" &&
    purchase.holdExpiresAt !== null &&
    purchase.holdExpiresAt.getTime() > now.getTime()
  );
}

export type OccurrenceAvailability = {
  capacity: number;
  validTickets: number;
  activeHolds: number;
  occupied: number;
  remaining: number;
  isSoldOut: boolean;
};

export function resolveAvailability(input: {
  capacity: number;
  validTickets: number;
  activeHolds: number;
}): OccurrenceAvailability {
  const occupied = input.validTickets + input.activeHolds;
  // `capacity` can be lowered below what is already sold; the floor keeps the
  // dashboard honest ("0 left") instead of showing a negative number.
  const remaining = Math.max(0, input.capacity - occupied);

  return {
    capacity: input.capacity,
    validTickets: input.validTickets,
    activeHolds: input.activeHolds,
    occupied,
    remaining,
    isSoldOut: remaining === 0,
  };
}

/**
 * Whether a purchase of `seats` seats fits.
 *
 * A live waitlist invitation covers exactly one seat, and only once ordinary
 * inventory is exhausted — it is a key to a seat that was released for that
 * person, not an extra seat stacked on top of what is already available. So it
 * grants its allowance at zero remaining and never widens a normal reservation.
 */
export function canReserve(
  availability: OccurrenceAvailability,
  seats: number = 1,
  options: { waitlistInvitationCoversSeat?: boolean } = {},
): boolean {
  if (seats <= 0) return false;

  const allowance =
    options.waitlistInvitationCoversSeat && availability.remaining === 0
      ? 1
      : 0;

  return availability.remaining + allowance >= seats;
}

/**
 * Deterministic lock order for a multi-occurrence purchase.
 *
 * Every transaction locks occurrence rows in ascending id order, so a Week Pass
 * and an individual sale competing for the same sessions serialize instead of
 * deadlocking. Deduplicated because one purchase may never take two seats in
 * the same occurrence.
 */
export function lockOrder(occurrenceIds: number[]): number[] {
  return [...new Set(occurrenceIds)].sort((a, b) => a - b);
}
