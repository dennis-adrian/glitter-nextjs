import { roundMoney } from "@/app/lib/reservations/money";
import {
  planReservationRepricing,
  type RepricingInvoice,
  type RepricingSettlement,
  type ReservationRepricing,
} from "@/app/lib/reservations/repricing";

/**
 * The money arithmetic of widening a half-table reservation into a full table.
 *
 * Pure, so the admin dialog can show exactly the numbers the service is going
 * to apply: both call this with the same inputs, and the service refuses when
 * the numbers it computes under its locks are not the ones the admin saw. The
 * arithmetic itself is the shared repricing model (`planReservationRepricing`),
 * priced at the table; this only names it for the upgrade.
 */

/** The reservation's live invoice as it stands before the upgrade. */
export type FullTableUpgradeInvoice = RepricingInvoice;

/**
 * The shared repricing plan, priced at the table. Beyond the table price
 * itself (`toPrice`), the fields the dialog reads:
 *
 * - `grossAmount` — the new cobro gross and `price_amount_snapshot`: the table
 *   price less what a late partner already paid (`latePartnerPrepaid`).
 *   `full_table_price_snapshot` keeps the raw table price.
 * - `writtenOffAmount` — what an admin earlier wrote off the cobro ("confirmar
 *   con saldo pendiente"). It survives the upgrade as a fixed amount off the
 *   new cobro.
 * - `completesAcceptance` — a waiting reservation the upgrade leaves fully
 *   paid is confirmed in the same step.
 */
export type FullTableUpgradePlan = ReservationRepricing & {
  /** The table price the reservation moves to. */
  toPrice: number;
};

export type FullTableUpgradeSettlementKind = RepricingSettlement["kind"];

export type FullTableUpgradeSettlementSummary = {
  kind: FullTableUpgradeSettlementKind;
  /** The balance owed, the credits handed back, or 0. */
  amount: number;
};

/**
 * What the admin agreed to in the dialog. The service recomputes the plan
 * under its locks and refuses when any of these no longer match, so a payment
 * approved or a table repriced after the page rendered is never applied behind
 * the admin's back.
 */
export type FullTableUpgradeExpectation = {
  tablePrice: number;
  settlementKind: FullTableUpgradeSettlementKind;
  settlementAmount: number;
};

export function planFullTableUpgrade(input: {
  tablePrice: number;
  priceAmountSnapshot: number | null;
  /** The reservation's live (non-cancelled) invoice; null when it has none. */
  liveInvoice: FullTableUpgradeInvoice | null;
  /** The tender's net coverage (earlier refunds already out); clamped at zero. */
  coveredAmount: number;
  /** The shared-price difference a late partner already paid in credits. */
  latePartnerPrepaid: number;
  reservationStatus: string;
  /** The live cobro went through an approved zero-value entitlement. */
  zeroValueEntitlementApproved: boolean;
}): FullTableUpgradePlan {
  const plan = planReservationRepricing({
    newStandPrice: input.tablePrice,
    latePartnerPrepaid: input.latePartnerPrepaid,
    priceAmountSnapshot: input.priceAmountSnapshot,
    liveInvoice: input.liveInvoice,
    coveredAmount: input.coveredAmount,
    reservationStatus: input.reservationStatus,
    zeroValueEntitlementApproved: input.zeroValueEntitlementApproved,
  });
  return { ...plan, toPrice: plan.newStandPrice };
}

export function summarizeFullTableUpgradeSettlement(
  settlement: RepricingSettlement,
): FullTableUpgradeSettlementSummary {
  switch (settlement.kind) {
    case "balance_due":
      return { kind: "balance_due", amount: settlement.outstandingAmount };
    case "overpaid":
      return { kind: "overpaid", amount: settlement.refundAmount };
    default:
      return { kind: "none", amount: 0 };
  }
}

/** The expectation a dialog built from `plan` sends back with the command. */
export function fullTableUpgradeExpectation(
  plan: FullTableUpgradePlan,
): FullTableUpgradeExpectation {
  const summary = summarizeFullTableUpgradeSettlement(plan.settlement);
  return {
    tablePrice: plan.toPrice,
    settlementKind: summary.kind,
    settlementAmount: summary.amount,
  };
}

export function fullTableUpgradeMatchesExpectation(
  plan: FullTableUpgradePlan,
  expected: FullTableUpgradeExpectation,
): boolean {
  const actual = fullTableUpgradeExpectation(plan);
  return (
    actual.tablePrice === roundMoney(expected.tablePrice) &&
    actual.settlementKind === expected.settlementKind &&
    actual.settlementAmount === roundMoney(expected.settlementAmount)
  );
}

/**
 * The admin-facing result message, rebuilt the same way on a replay so a retry
 * after a lost response still says a balance was reopened, credits returned,
 * or the reservation confirmed.
 */
export function fullTableUpgradeSuccessMessage(
  settlement: FullTableUpgradeSettlementSummary,
  accepted = false,
): string {
  const done = "La reserva ahora ocupa la mesa completa.";
  const confirmed = accepted
    ? " Lo ya pagado cubre la mesa, así que quedó confirmada."
    : "";
  switch (settlement.kind) {
    case "balance_due":
      return `${done} Quedó un saldo pendiente de Bs${roundMoney(settlement.amount)}.`;
    case "overpaid":
      return `${done} Se devolvieron Bs${roundMoney(settlement.amount)} en créditos.${confirmed}`;
    default:
      return `${done}${confirmed}`;
  }
}
