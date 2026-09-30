import { roundMoney } from "@/app/lib/reservations/money";
import {
  repriceInvoice,
  resolveStandChangeSettlement,
  type StandChangeSettlement,
} from "@/app/lib/reservations/stand-change";

/**
 * The money arithmetic of widening a half-table reservation into a full table.
 *
 * Pure, so the admin dialog can show exactly the numbers the service is going
 * to apply: both call this with the same inputs, and the service refuses when
 * the numbers it computes under its locks are not the ones the admin saw.
 */

/** The reservation's live invoice as it stands before the upgrade. */
export type FullTableUpgradeInvoice = {
  originalAmount: number;
  discountAmount: number;
  amount: number;
};

export type FullTableUpgradePlan = {
  /** `price_amount_snapshot` before the upgrade. */
  fromPrice: number | null;
  /** The table price the reservation moves to. */
  toPrice: number;
  /** False when the reservation already bills exactly the table price. */
  priceChanged: boolean;
  /** The discount that survives, clamped to the table price; 0 with no invoice. */
  discountAmount: number;
  /** The live invoice's `amount` (net of discount) before; null with no invoice. */
  currentInvoiceAmount: number | null;
  /**
   * What an admin earlier wrote off the live invoice ("confirmar con saldo
   * pendiente"): its gross less discount less what it asks for. Repricing
   * recomputes `amount` from the price and the discount, so this does not
   * survive the upgrade, and the dialog has to say so.
   */
  writtenOffAmount: number;
  /** The live invoice's `amount` after; the table price when there is none. */
  newInvoiceAmount: number;
  /** Approved cash plus confirmed credits, net of earlier refunds. */
  coveredAmount: number;
  settlement: StandChangeSettlement;
};

export type FullTableUpgradeSettlementKind = StandChangeSettlement["kind"];

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
  /** Already net of earlier refunds; clamped at zero here regardless. */
  coveredAmount: number;
}): FullTableUpgradePlan {
  const toPrice = roundMoney(input.tablePrice);
  const fromPrice =
    input.priceAmountSnapshot == null
      ? null
      : roundMoney(input.priceAmountSnapshot);
  const priceChanged = fromPrice == null || fromPrice !== toPrice;
  const coveredAmount = Math.max(0, roundMoney(input.coveredAmount));

  const invoice = input.liveInvoice;
  const repriced =
    invoice == null ? null : repriceInvoice(toPrice, invoice.discountAmount);
  const newInvoiceAmount = repriced?.amount ?? toPrice;
  const writtenOffAmount =
    invoice == null
      ? 0
      : Math.max(
          0,
          roundMoney(
            invoice.originalAmount - invoice.discountAmount - invoice.amount,
          ),
        );

  return {
    fromPrice,
    toPrice,
    priceChanged,
    discountAmount: repriced?.discountAmount ?? 0,
    currentInvoiceAmount: invoice == null ? null : roundMoney(invoice.amount),
    writtenOffAmount,
    newInvoiceAmount,
    coveredAmount,
    settlement: priceChanged
      ? resolveStandChangeSettlement({ newInvoiceAmount, coveredAmount })
      : { kind: "none" },
  };
}

export function summarizeFullTableUpgradeSettlement(
  settlement: StandChangeSettlement,
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
 * after a lost response still says a balance was reopened or credits returned.
 */
export function fullTableUpgradeSuccessMessage(
  settlement: FullTableUpgradeSettlementSummary,
): string {
  const done = "La reserva ahora ocupa la mesa completa.";
  switch (settlement.kind) {
    case "balance_due":
      return `${done} Quedó un saldo pendiente de Bs${roundMoney(settlement.amount)}.`;
    case "overpaid":
      return `${done} Se devolvieron Bs${roundMoney(settlement.amount)} en créditos.`;
    default:
      return done;
  }
}
