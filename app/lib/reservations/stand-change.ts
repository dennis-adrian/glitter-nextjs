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
  priceAmountSnapshot: number | null;
};

export type StandChangePricing = {
  /** New `price_amount_snapshot` for the reservation. */
  priceAmount: number;
  individualPrice: number;
  sharedPrice: number | null;
  /** False when the destination bills exactly what the origin did. */
  priceChanged: boolean;
};

/**
 * What the reservation costs on its destination stand.
 *
 * The participant-count rule is §6.1's, the same one `createAdminReservation`
 * and hold confirmation apply: the shared price is the total for owner plus
 * partner, and a two-person booking still bills the individual price until an
 * admin configures a shared one.
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
  const priceAmount =
    reservation.bookedParticipantCount > 1 && sharedPrice != null
      ? sharedPrice
      : individualPrice;
  const currentPriceAmount =
    reservation.priceAmountSnapshot == null
      ? null
      : roundMoney(reservation.priceAmountSnapshot);

  return {
    priceAmount,
    individualPrice,
    sharedPrice,
    priceChanged:
      currentPriceAmount == null || currentPriceAmount !== priceAmount,
  };
}

export type InvoiceReprice = {
  originalAmount: number;
  discountAmount: number;
  amount: number;
};

/**
 * The invoice rewritten for a new stand price.
 *
 * The discount is clamped to the new price for the same reason the full-table
 * downgrade clamps it: a discount agreed against an expensive stand can exceed
 * a cheaper one outright, and an unclamped one would invert the total. `amount`
 * is what is owed, so it keeps honouring whatever discount survives the clamp —
 * writing the gross price here would bill a discounted participant in full and
 * break the invoice's own `amount = originalAmount - discountAmount` invariant.
 */
export function repriceInvoice(
  price: number,
  currentDiscountAmount: number,
): InvoiceReprice {
  const originalAmount = roundMoney(price);
  const discountAmount = Math.min(
    originalAmount,
    roundMoney(currentDiscountAmount),
  );
  return {
    originalAmount,
    discountAmount,
    amount: roundMoney(originalAmount - discountAmount),
  };
}

/**
 * How a price change lands on an invoice that has already been paid into.
 *
 * The stand change itself never decides about money in the abstract — it
 * resolves the exact arithmetic of one invoice against one new price:
 *
 * - `none` — nothing is owed and nothing was overpaid. The common case, and
 *   the only outcome when no money has been tendered.
 * - `balance_due` — the new stand costs more than has been covered. The
 *   invoice carries the balance on its own, since `outstanding` is already
 *   `amount - covered`; the reservation reopens for payment.
 * - `overpaid` — more has been covered than the new stand costs. The surplus
 *   goes back as credits rather than cash: credits are the only refund
 *   instrument this product has.
 */
export type StandChangeSettlement =
  | { kind: "none" }
  | { kind: "balance_due"; outstandingAmount: number }
  | { kind: "overpaid"; refundAmount: number };

/**
 * Resolves a repriced invoice against what has already been covered.
 *
 * `coveredAmount` is approved cash plus confirmed credits — the same figure
 * `getInvoiceTenderTotalsInTx` computes. Deliberately measured against what was
 * *covered* rather than against the old price: a participant who paid half of
 * an expensive stand and moves to a cheaper one has not overpaid anything, and
 * comparing prices instead of payments would hand them credits they never
 * funded.
 */
export function resolveStandChangeSettlement(input: {
  newInvoiceAmount: number;
  coveredAmount: number;
}): StandChangeSettlement {
  const newAmount = roundMoney(input.newInvoiceAmount);
  const covered = roundMoney(input.coveredAmount);
  if (covered > newAmount) {
    return { kind: "overpaid", refundAmount: roundMoney(covered - newAmount) };
  }
  if (covered < newAmount && covered > 0) {
    return {
      kind: "balance_due",
      outstandingAmount: roundMoney(newAmount - covered),
    };
  }
  return { kind: "none" };
}
