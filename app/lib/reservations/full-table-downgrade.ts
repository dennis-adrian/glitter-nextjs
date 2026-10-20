import {
  computeInvoiceTender,
  type TenderAllocationInput,
  type TenderPaymentInput,
  type TenderSubmissionInput,
} from "@/app/lib/payments/tender";

/**
 * Why a full table cannot be reduced to a half: real money sits on its cobro.
 *
 * The downgrade reprices the cobro to one half and never moves money, so
 * anything already tendered against the table's price would have to be
 * refunded or re-applied — a decision it cannot make. Ordered by what the
 * admin can do about it: a proof in review can be resolved, the rest cannot
 * be undone from here.
 */
export type FullTableDowngradeMoneyBlocker =
  | "proof_under_review"
  | "credits"
  | "approved_payment"
  | "legacy_payment";

const BLOCKER_PRIORITY: readonly FullTableDowngradeMoneyBlocker[] = [
  "proof_under_review",
  "credits",
  "approved_payment",
  "legacy_payment",
];

export type InvoiceMoneyRows = {
  payments: readonly TenderPaymentInput[];
  allocations: readonly TenderAllocationInput[];
  submissions: readonly TenderSubmissionInput[];
};

/**
 * What real money one cobro holds, in the tender's own terms.
 *
 * The downgrade used to refuse on any `payments` or allocation row at all, so
 * rows with no money behind them blocked it for good: the payment row a
 * rejected comprobante leaves (rejection only marks the submission), and an
 * allocation whose credits an admin already handed back (the reversal is a
 * ledger entry; the row stays as history). Everywhere else those count as
 * nothing (`computeInvoiceTender`), and here they do too.
 *
 * What still blocks:
 * - any submission in review — a comprobante or a zero-value request — the
 *   same rule every repricing applies (`invoicesHaveProofUnderReview`);
 * - unreversed credits and approved cash, the tender's `coveredAmount`;
 * - a payment row no submission vouches for at all: a legacy payment from
 *   before submissions existed, which is money the tender cannot see.
 */
export function invoiceMoneyBlocker(
  rows: InvoiceMoneyRows,
): FullTableDowngradeMoneyBlocker | null {
  if (
    rows.submissions.some((submission) => submission.status === "submitted")
  ) {
    return "proof_under_review";
  }
  const tender = computeInvoiceTender({ amount: 0, ...rows });
  if (tender.confirmedCreditAmount > 0) return "credits";
  if (tender.approvedCashAmount > 0) return "approved_payment";
  const vouched = new Set(
    rows.submissions.flatMap((submission) =>
      submission.paymentId != null ? [submission.paymentId] : [],
    ),
  );
  if (rows.payments.some((payment) => !vouched.has(payment.id))) {
    return "legacy_payment";
  }
  return null;
}

/** The most actionable blocker across a reservation's cobros, if any. */
export function strongestMoneyBlocker(
  blockers: readonly (FullTableDowngradeMoneyBlocker | null)[],
): FullTableDowngradeMoneyBlocker | null {
  return BLOCKER_PRIORITY.find((blocker) => blockers.includes(blocker)) ?? null;
}
