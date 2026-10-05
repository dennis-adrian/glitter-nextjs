import { roundMoney } from "@/app/lib/reservations/money";

/**
 * Reservation statuses a stand change may act on.
 *
 * Exactly the occupancy statuses: a reservation that no longer occupies a
 * stand has nothing to move, and moving one would hand it capacity it gave up.
 */
export const MOVABLE_RESERVATION_STATUSES = [
  "pending",
  "verification_payment",
  "accepted",
] as const;

export type MovableReservationStatus =
  (typeof MOVABLE_RESERVATION_STATUSES)[number];

export function isMovableReservationStatus(
  status: string,
): status is MovableReservationStatus {
  return (MOVABLE_RESERVATION_STATUSES as readonly string[]).includes(status);
}

export type StandPricing = {
  individualPrice: number;
  /** Null where the stand's category has no shared option. */
  sharedPrice: number | null;
};

export type ReservationPricingSnapshot = {
  bookedParticipantCount: number;
};

export type StandChangePricing = {
  /**
   * What the destination bills this reservation's headcount — the price the
   * shared repricing model starts from, before a late partner's payment comes
   * off it.
   */
  standPrice: number;
  individualPrice: number;
  sharedPrice: number | null;
};

/**
 * What the reservation's headcount costs on its destination stand.
 *
 * The participant-count rule is §6.1's, the same one `createAdminReservation`
 * and hold confirmation apply: the shared price is the total for owner plus
 * partner, and a two-person booking still bills the individual price until an
 * admin configures a shared one.
 *
 * Whether that is a price *change* is not decided here: a late partner's
 * payment has to come off it first, which `planReservationRepricing` does.
 */
export function resolveStandChangePricing(
  reservation: ReservationPricingSnapshot,
  destination: StandPricing,
): StandChangePricing {
  const individualPrice = roundMoney(destination.individualPrice);
  const sharedPrice =
    destination.sharedPrice == null
      ? null
      : roundMoney(destination.sharedPrice);
  return {
    standPrice:
      reservation.bookedParticipantCount > 1 && sharedPrice != null
        ? sharedPrice
        : individualPrice,
    individualPrice,
    sharedPrice,
  };
}
