import { roundMoney } from "@/app/lib/reservations/money";

/**
 * What adding a partner after booking costs (PRD §6.2).
 *
 * Two components, kept separate all the way to the ledger:
 *
 *   shared price difference = shared snapshot - individual snapshot
 *   amount due             = that difference + the feature price
 *
 * The difference exists because the original invoice was billed for one
 * person and the reservation is about to hold two. It is charged in credits
 * rather than by repricing that invoice, which stays exactly as it was
 * (§8.4) — the admin partner flow reprices instead, and the two must not be
 * confused for each other.
 *
 * Both snapshots come from the reservation, never from the stand's current
 * prices: a participant pays what their booking was quoted, not what an admin
 * has since changed the stand to.
 *
 * A full table has no difference to charge. It is priced as a product of its
 * own whatever its headcount (§7.1), so a second person costs nothing more and
 * the owner pays the fee alone. Its halves keep their individual and shared
 * snapshots, which is exactly why this has to be decided on the table
 * snapshot rather than left to fall out of the half prices.
 */
export type LatePartnerPrice = {
  /** `shared - individual`, floored at zero; always zero on a full table. */
  sharedPriceDifference: number;
  /** The festival's configured late-partner fee. */
  featurePrice: number;
  /** What the owner is actually debited. */
  totalCredits: number;
  /** Priced as a full table: the fee only, with nothing for the headcount. */
  fullTable: boolean;
};

export type LatePartnerPriceInput = {
  individualPriceSnapshot: number | null;
  sharedPriceSnapshot: number | null;
  /**
   * The reservation's `full_table_price_snapshot`. Required rather than
   * optional so no caller can forget it and quietly charge a full table for a
   * price difference it does not have.
   */
  fullTablePriceSnapshot: number | null;
  featurePrice: number;
};

/**
 * Null when the reservation cannot be priced for a second person — no shared
 * price was snapshotted at booking, so there is no agreed figure for what two
 * people cost. The feature is withheld rather than guessed at; §6.1 requires
 * admins to configure illustration shared prices before enabling it. A full
 * table needs no shared price, since the table price already covers two.
 */
export function latePartnerPrice(
  input: LatePartnerPriceInput,
): LatePartnerPrice | null {
  if (!Number.isFinite(input.featurePrice) || input.featurePrice < 0) {
    return null;
  }

  if (input.fullTablePriceSnapshot != null) {
    const featurePrice = roundMoney(input.featurePrice);
    return {
      sharedPriceDifference: 0,
      featurePrice,
      totalCredits: featurePrice,
      fullTable: true,
    };
  }

  if (input.sharedPriceSnapshot == null) return null;

  const individual = roundMoney(input.individualPriceSnapshot ?? 0);
  const shared = roundMoney(input.sharedPriceSnapshot);
  // Floored rather than trusted: the stand table enforces shared >= individual,
  // but these are snapshots of a past booking and a negative difference would
  // turn the fee into a partial refund.
  const sharedPriceDifference = Math.max(0, roundMoney(shared - individual));
  const featurePrice = roundMoney(input.featurePrice);

  return {
    sharedPriceDifference,
    featurePrice,
    totalCredits: roundMoney(sharedPriceDifference + featurePrice),
    fullTable: false,
  };
}
