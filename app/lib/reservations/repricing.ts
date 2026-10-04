import { roundMoney } from "@/app/lib/reservations/money";

/**
 * The one piece of arithmetic behind every command that changes what a live
 * reservation costs: the stand switch and exchange, the full-table upgrade, the
 * full-table downgrade, and the admin partner edit.
 *
 * Pure on purpose. The upgrade dialog shows exactly these numbers before the
 * admin confirms, and four commands that each did their own sums had already
 * drifted apart: one counted a late partner's payment, none carried a
 * write-off, and only some knew what "fully paid" meant.
 *
 * The model, in the order it is applied:
 *
 * 1. `gross = max(0, newStandPrice - latePartnerPrepaid)`. What a late partner
 *    already paid in credits towards the shared price is money paid for the
 *    stand, so the cobro only asks for the rest — the same shape the late
 *    partner flow itself leaves behind (cobro at the individual price, the
 *    difference on the feature action). `gross` is the new cobro's
 *    `original_amount` and the new `price_amount_snapshot`.
 * 2. The discount is clamped to `gross`, and an amount an admin wrote off
 *    earlier ("confirmar con saldo pendiente") is carried as a fixed
 *    concession: `amount = max(0, gross - discount - writtenOff)`.
 * 3. `effective` is what the stand still asks for once everything already
 *    counted is taken off. It is the new `amount`, except when the late-partner
 *    payment alone exceeds the new price: then it goes negative by that excess,
 *    so the excess is handed back — as the late partner's money, not the
 *    cobro's (`latePartnerRefundAmount`). A discount or write-off larger than the
 *    price never goes negative — a concession is not money anybody paid.
 * 4. `owed = effective - covered`, and the settlement follows from it and the
 *    reservation's status (see `planReservationRepricing`).
 */

/** A cobro as it stands before the reprice. */
export type RepricingInvoice = {
  originalAmount: number;
  discountAmount: number;
  amount: number;
  /**
   * What "confirmar con saldo pendiente" waived on this cobro, from its own
   * events (`recordedWriteOffAmount`). Optional: a caller without it carries
   * the write-off the row shows.
   */
  recordedWriteOffAmount?: number;
};

/**
 * What the reprice does with money already paid.
 *
 * - `none` — nothing is owed and nothing was overpaid, or nothing can be asked
 *   for yet (an unpaid pending reservation only has its amount moved).
 * - `balance_due` — the reservation now costs more than has been paid; it
 *   reopens for the difference.
 * - `overpaid` — more has been paid than it now costs; the surplus comes back
 *   as credits.
 */
export type RepricingSettlement =
  | { kind: "none" }
  | { kind: "balance_due"; outstandingAmount: number }
  | { kind: "overpaid"; refundAmount: number };

export type RepricedInvoice = RepricingInvoice & {
  /** The write-off the cobro carried before, which the new amount keeps. */
  writtenOffAmount: number;
};

/**
 * The write-off a cobro carries: its gross, less the discount, less what it
 * actually asks for. Only "confirmar con saldo pendiente" lowers `amount` below
 * `original_amount - discount_amount`, so anything above zero is that.
 *
 * Except on a cobro of Bs0: a reprice to a price the concession exceeded
 * clamped the amount there and stored a shrunken write-off, and reading it
 * back from the row would lose the rest on the next move (Bs200 waived, moved
 * to a Bs150 stand and back, asked for Bs350 instead of Bs300). There the
 * write-offs the cobro's own events recorded are the truth, when a caller has
 * them. Only there: an amount an admin set or restored since is the row's
 * word, not the events'.
 */
export function invoiceWrittenOffAmount(invoice: RepricingInvoice): number {
  const fromRow = Math.max(
    0,
    roundMoney(
      invoice.originalAmount - invoice.discountAmount - invoice.amount,
    ),
  );
  if (roundMoney(invoice.amount) > 0) return fromRow;
  return Math.max(fromRow, roundMoney(invoice.recordedWriteOffAmount ?? 0));
}

/**
 * One cobro rewritten for a new gross amount.
 *
 * The discount is clamped to the new gross: a discount agreed against an
 * expensive stand can exceed a cheaper one outright, and an unclamped one would
 * invert the total. The write-off rides along as a fixed amount rather than
 * being recomputed away — an admin who waived Bs200 waived Bs200, whatever the
 * stand costs now.
 */
export function repriceInvoiceAmounts(
  grossAmount: number,
  current: RepricingInvoice,
): RepricedInvoice {
  const originalAmount = Math.max(0, roundMoney(grossAmount));
  const writtenOffAmount = invoiceWrittenOffAmount(current);
  const discountAmount = Math.min(
    originalAmount,
    Math.max(0, roundMoney(current.discountAmount)),
  );
  return {
    originalAmount,
    discountAmount,
    amount: Math.max(
      0,
      roundMoney(originalAmount - discountAmount - writtenOffAmount),
    ),
    writtenOffAmount,
  };
}

export type ReservationRepricingInput = {
  /**
   * Whatever the command prices: the destination's individual or shared price
   * by headcount for a switch, the table price for an upgrade, the half's price
   * by headcount for a downgrade or a partner edit.
   */
  newStandPrice: number;
  /**
   * The shared-price difference a late partner already paid in credits (the
   * `shared_price_difference` items of the reservation's fulfilled, unreversed
   * `late_partner` actions). Never the late-partner fee, which stays spent.
   */
  latePartnerPrepaid: number;
  /** `price_amount_snapshot` before the change; null counts as a change. */
  priceAmountSnapshot: number | null;
  /** The live (non-cancelled) cobro; null when the reservation has none. */
  liveInvoice: RepricingInvoice | null;
  /**
   * The live cobros' tender `coveredAmount`: approved cash plus unreversed
   * credit allocations, less earlier refunds tagged to this reservation
   * (netted by the invoice tender, never again here). Clamped at zero here
   * regardless.
   */
  coveredAmount: number;
  reservationStatus: string;
  /**
   * Whether the live cobro was confirmed through an approved zero-value
   * entitlement. With a cobro of Bs0 on an accepted reservation, one of the two
   * signs it was confirmed at no cost (see `planReservationRepricing`).
   */
  zeroValueEntitlementApproved: boolean;
};

export type ReservationRepricing = {
  newStandPrice: number;
  latePartnerPrepaid: number;
  /** `price_amount_snapshot` before. */
  fromPrice: number | null;
  /** New `price_amount_snapshot` and the cobro's new `original_amount`. */
  grossAmount: number;
  /** False when the gross matches the snapshot: nothing about money moves. */
  priceChanged: boolean;
  /** The discount that survives, clamped to the gross; 0 with no cobro. */
  discountAmount: number;
  /** The write-off the cobro carried before, kept by the reprice. */
  writtenOffAmount: number;
  /** The cobro's `amount` before; null with no cobro. */
  currentInvoiceAmount: number | null;
  /** The cobro's `amount` after; the gross when there is no cobro. */
  newInvoiceAmount: number;
  /** What the stand still asks for; negative only by a late-partner excess. */
  effectiveAmount: number;
  coveredAmount: number;
  /**
   * The reservation is `accepted` with nothing paid because it was confirmed
   * at no cost: its cobro was Bs0 (a full discount, a zero-price stand) or it
   * went through an approved zero-value entitlement. Such a reservation owes a
   * dearer stand's difference like a paid one.
   */
  confirmedAtNoCost: boolean;
  /** `effective - covered`: positive owes, negative was overpaid. */
  owedAmount: number;
  settlement: RepricingSettlement;
  /**
   * The part of an `overpaid` refund that hands back a late partner's payment
   * rather than money on the cobro: its excess over the new price, `-effective`.
   * The refund grant records it, so the late-partner figure drops by it
   * (`latePartnerPrepaidAmount`) and the cobro's tender nets only the rest.
   * Netted against the cobro, it could never be absorbed there — the cobro
   * never held it — and would come back against the next payment instead. 0
   * unless the refund includes such an excess.
   */
  latePartnerRefundAmount: number;
  /**
   * The reservation is now fully paid and still waiting for it — `pending`, or
   * `verification_payment` with no comprobante in review (the commands refuse a
   * price change while one is) — so the reprice completes the acceptance in
   * the same transaction. Without this it would sit at "pending" with nothing
   * left to pay and no way to confirm it.
   */
  completesAcceptance: boolean;
  /** The reservation status once the reprice is applied. */
  resultingStatus: string;
};

/** Statuses still waiting on payment, which a fully paid reprice accepts. */
function awaitsPayment(status: string): boolean {
  return status === "pending" || status === "verification_payment";
}

/**
 * Plans a reprice: the new cobro, and what happens to money already paid.
 *
 * With the price changed and a cobro to settle:
 *
 * - `owed > 0` reopens the reservation for the balance when anything has been
 *   paid, or when it was confirmed at no cost (`confirmedAtNoCost`: accepted
 *   on a Bs0 cobro or through an approved zero-value entitlement) — that one
 *   owes the difference exactly like a paid one (Dennis, 2026-09-29). Anything
 *   else with nothing paid only has its amount moved: an unpaid `pending`
 *   reservation already owes, and an accepted one whose positive cobro is
 *   marked paid with no payment rows was paid outside the system, which this
 *   model cannot measure — so it is neither reopened nor refunded.
 * - `owed == 0` with anything paid (cash, credits or a late partner's
 *   difference) is fully paid, and a reservation still waiting is accepted.
 * - `owed < 0` hands the surplus back as credits, and accepts a waiting
 *   reservation too — it is more than paid.
 *
 * No price change, or no cobro to settle, touches no money: a late-partner
 * reservation moved to an identically priced stand is a no-op, and an external
 * participant's reservation has nothing to collect or refund.
 */
export function planReservationRepricing(
  input: ReservationRepricingInput,
): ReservationRepricing {
  const newStandPrice = roundMoney(input.newStandPrice);
  const latePartnerPrepaid = Math.max(0, roundMoney(input.latePartnerPrepaid));
  const netOfLatePartner = roundMoney(newStandPrice - latePartnerPrepaid);
  const grossAmount = Math.max(0, netOfLatePartner);
  const fromPrice =
    input.priceAmountSnapshot == null
      ? null
      : roundMoney(input.priceAmountSnapshot);
  const priceChanged = fromPrice == null || fromPrice !== grossAmount;
  const coveredAmount = Math.max(0, roundMoney(input.coveredAmount));

  const invoice = input.liveInvoice;
  const repriced =
    invoice == null ? null : repriceInvoiceAmounts(grossAmount, invoice);
  const newInvoiceAmount = repriced?.amount ?? grossAmount;
  const effectiveAmount =
    netOfLatePartner < 0 ? netOfLatePartner : newInvoiceAmount;
  const owedAmount = roundMoney(effectiveAmount - coveredAmount);

  // Only an accepted reservation was confirmed, and only a Bs0 cobro or an
  // approved zero-value request says it was confirmed for nothing. A positive
  // cobro marked paid with no tender is not that: the money came in outside
  // the system, and "nothing covered" says nothing about what is owed.
  const confirmedAtNoCost =
    invoice != null &&
    input.reservationStatus === "accepted" &&
    coveredAmount <= 0 &&
    (roundMoney(invoice.amount) <= 0 || input.zeroValueEntitlementApproved);

  let settlement: RepricingSettlement = { kind: "none" };
  let completesAcceptance = false;
  if (priceChanged && invoice != null) {
    const anythingPaid = coveredAmount > 0 || latePartnerPrepaid > 0;
    if (owedAmount > 0) {
      if (coveredAmount > 0 || confirmedAtNoCost) {
        settlement = { kind: "balance_due", outstandingAmount: owedAmount };
      }
    } else if (owedAmount < 0) {
      settlement = { kind: "overpaid", refundAmount: roundMoney(-owedAmount) };
      completesAcceptance = awaitsPayment(input.reservationStatus);
    } else if (anythingPaid) {
      completesAcceptance = awaitsPayment(input.reservationStatus);
    }
  }

  return {
    newStandPrice,
    latePartnerPrepaid,
    fromPrice,
    grossAmount,
    priceChanged,
    discountAmount: repriced?.discountAmount ?? 0,
    writtenOffAmount: repriced?.writtenOffAmount ?? 0,
    currentInvoiceAmount: invoice == null ? null : roundMoney(invoice.amount),
    newInvoiceAmount,
    effectiveAmount,
    coveredAmount,
    confirmedAtNoCost,
    owedAmount,
    settlement,
    latePartnerRefundAmount:
      settlement.kind === "overpaid" && effectiveAmount < 0
        ? Math.min(settlement.refundAmount, roundMoney(-effectiveAmount))
        : 0,
    completesAcceptance,
    resultingStatus:
      settlement.kind === "balance_due"
        ? "pending"
        : completesAcceptance
          ? "accepted"
          : input.reservationStatus,
  };
}
