import { roundMoney } from "@/app/lib/reservations/money";

/**
 * What has been put towards a reservation invoice, by tender.
 *
 * An invoice used to be settled by exactly one voucher, which is why the admin
 * tables could show `invoices.amount` beside a voucher and be telling the
 * truth. Credits broke that: a participant can cover part of the bill from
 * their balance and the rest by QR, and `invoices.status` has no value that
 * says so. This is the shape that does.
 */
export type InvoiceTender = {
  /** `invoices.amount` — the bill after any discount. */
  totalAmount: number;
  /** Cash backing an approved settlement submission. */
  approvedCashAmount: number;
  /** Credits allocated and not since reversed. */
  confirmedCreditAmount: number;
  /**
   * Cash on a submission still awaiting review.
   *
   * Deliberately excluded from `coveredAmount`: an unreviewed voucher is a
   * claim, not money. It is carried separately because the difference between
   * "nobody has paid" and "a voucher is sitting in the queue" is the whole
   * point of the settlement screen.
   */
  submittedCashAmount: number;
  coveredAmount: number;
  outstandingAmount: number;
};

export type TenderAllocationInput = {
  amount: number | string;
  /** True once a ledger entry reverses this allocation's spend. */
  reversed: boolean;
};

export type TenderPaymentInput = {
  id: number;
  amount: number | string;
};

export type TenderSubmissionInput = {
  paymentId: number | null;
  status: "submitted" | "approved" | "rejected";
};

export type InvoiceTenderInput = {
  amount: number | string;
  allocations: readonly TenderAllocationInput[];
  payments: readonly TenderPaymentInput[];
  submissions: readonly TenderSubmissionInput[];
};

function toAmount(value: number | string): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumPaymentsForSubmissionStatus(
  payments: readonly TenderPaymentInput[],
  submissions: readonly TenderSubmissionInput[],
  status: TenderSubmissionInput["status"],
): number {
  const paymentIds = new Set(
    submissions
      .filter(
        (submission) =>
          submission.status === status && submission.paymentId != null,
      )
      .map((submission) => submission.paymentId!),
  );
  if (paymentIds.size === 0) return 0;

  // A payment is counted once even when several submissions point at it: the
  // row is mutated in place across re-uploads, so its history is a chain of
  // submissions over one payment, not one payment per submission.
  const counted = new Set<number>();
  let total = 0;
  for (const payment of payments) {
    if (!paymentIds.has(payment.id) || counted.has(payment.id)) continue;
    counted.add(payment.id);
    total += toAmount(payment.amount);
  }
  return roundMoney(total);
}

/**
 * The single definition of invoice coverage.
 *
 * `getInvoiceTenderTotalsInTx` computes the same totals in SQL for the locked
 * write paths; it delegates the arithmetic here so the list screens and the
 * settlement engine can never disagree about what an invoice is owed.
 */
export function computeInvoiceTender(input: InvoiceTenderInput): InvoiceTender {
  const totalAmount = roundMoney(toAmount(input.amount));

  const confirmedCreditAmount = roundMoney(
    input.allocations
      .filter((allocation) => !allocation.reversed)
      .reduce((sum, allocation) => sum + toAmount(allocation.amount), 0),
  );

  const approvedCashAmount = sumPaymentsForSubmissionStatus(
    input.payments,
    input.submissions,
    "approved",
  );
  const submittedCashAmount = sumPaymentsForSubmissionStatus(
    input.payments,
    input.submissions,
    "submitted",
  );

  const coveredAmount = roundMoney(approvedCashAmount + confirmedCreditAmount);

  return {
    totalAmount,
    approvedCashAmount,
    confirmedCreditAmount,
    submittedCashAmount,
    coveredAmount,
    // Clamped: an over-allocated invoice is a bug to surface elsewhere, not a
    // negative balance to render.
    outstandingAmount: Math.max(0, roundMoney(totalAmount - coveredAmount)),
  };
}

/** True when the tender covers more than the invoice asks for. */
export function isOverAllocated(tender: InvoiceTender): boolean {
  return tender.coveredAmount > tender.totalAmount;
}

export const EMPTY_TENDER: InvoiceTender = {
  totalAmount: 0,
  approvedCashAmount: 0,
  confirmedCreditAmount: 0,
  submittedCashAmount: 0,
  coveredAmount: 0,
  outstandingAmount: 0,
};
