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
  /**
   * Cash backing an approved settlement submission. A fact about the rows, so
   * gross of any repricing refund — see `refundedAmount`.
   */
  approvedCashAmount: number;
  /** Credits allocated and not since reversed; gross, like the cash. */
  confirmedCreditAmount: number;
  /**
   * What a repricing already handed back from this cobro's tender.
   *
   * A move to a cheaper stand (or an upgrade that leaves the reservation
   * overpaid) returns the surplus as a credit grant tagged to the reservation
   * and leaves the payments and allocations standing, so the rows alone
   * overstate what still pays the cobro: Bs500 paid, moved to a Bs300 stand
   * with Bs200 back, then moved back to Bs500, is Bs200 short — and the rows
   * still say Bs500. The reservation's outstanding refunds are netted here,
   * once, against its live cobro, so every screen and every settlement guard
   * reads the same balance the repricing model does.
   *
   * Never more than the cash and credits it is netted against; a cancelled
   * cobro carries none.
   */
  refundedAmount: number;
  /**
   * Cash on a submission still awaiting review.
   *
   * Deliberately excluded from `coveredAmount`: an unreviewed voucher is a
   * claim, not money. It is carried separately because the difference between
   * "nobody has paid" and "a voucher is sitting in the queue" is the whole
   * point of the settlement screen.
   */
  submittedCashAmount: number;
  /** Approved cash plus confirmed credits, less `refundedAmount`. */
  coveredAmount: number;
  outstandingAmount: number;
  /**
   * A zero-value entitlement request is awaiting review.
   *
   * Carried because `settleInvoiceShortfall` refuses outright in this state —
   * `approveSubmissionInTx` only accepts such a request on an invoice of
   * exactly zero — and without it no screen can tell in advance, so the menu
   * offered an action that always failed.
   */
  pendingZeroValueRequest: boolean;
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
  /** Absent where a caller has no need to distinguish request kinds. */
  kind?: string | null;
};

export type InvoiceTenderInput = {
  amount: number | string;
  allocations: readonly TenderAllocationInput[];
  payments: readonly TenderPaymentInput[];
  submissions: readonly TenderSubmissionInput[];
  /**
   * The share of the reservation's outstanding repricing refunds attributed to
   * this cobro (`attributeRepricingRefunds`). Absent or 0 for a caller that
   * only asks about the rows themselves, such as the downgrade's money check.
   */
  refundedAmount?: number;
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
  // row is reused across unapproved re-uploads. Once approved it is preserved;
  // paying a reopened balance creates a separate payment and submission.
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
 * `loadInvoiceTenders` (`tender-queries.ts`) reads the rows and the
 * reservation's repricing refunds for both the locked write paths
 * (`getInvoiceTenderTotalsInTx`) and the list screens (`fetchInvoiceTenders`),
 * and hands them here, so the settlement engine and every screen can never
 * disagree about what an invoice is owed.
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

  const tenderedAmount = roundMoney(approvedCashAmount + confirmedCreditAmount);
  // Clamped to what it is netted against, so coverage never goes negative. A
  // guard, not a rule: the one refund that could exceed the cobro's tender — a
  // late partner's payment beyond a cheaper stand's price — is recorded as the
  // late partner's and taken off that figure instead (`latePartnerRefundedAmount`),
  // never netted here. Clamping it here would read as dropped, then come back
  // against the next payment.
  const refundedAmount = Math.min(
    tenderedAmount,
    Math.max(0, roundMoney(toAmount(input.refundedAmount ?? 0))),
  );
  const coveredAmount = roundMoney(tenderedAmount - refundedAmount);

  const pendingZeroValueRequest = input.submissions.some(
    (submission) =>
      submission.status === "submitted" &&
      submission.kind === "zero_value_entitlement",
  );

  return {
    totalAmount,
    approvedCashAmount,
    confirmedCreditAmount,
    refundedAmount,
    submittedCashAmount,
    coveredAmount,
    // Clamped: an over-allocated invoice is a bug to surface elsewhere, not a
    // negative balance to render.
    outstandingAmount: Math.max(0, roundMoney(totalAmount - coveredAmount)),
    pendingZeroValueRequest,
  };
}

/** A live cobro of one reservation, as the refund attribution sees it. */
export type RefundAttributionInvoice = {
  id: number;
  /** Approved cash plus confirmed credits: the tender a refund came out of. */
  tenderedAmount: number;
};

/**
 * Splits a reservation's outstanding repricing refunds across its live cobros.
 *
 * A reservation carries one live cobro — both creation paths insert exactly
 * one and repricing keeps it — so in practice the whole refund lands on it.
 * Nothing in the schema enforces that, though, so a second live cobro is
 * handled deterministically rather than by whichever row a query returned
 * first: in ascending id, each cobro absorbs up to its own tender and passes
 * the rest on. The total netted is then exactly `min(refund, Σ tender)`, the
 * reservation-wide figure the repricing model has always used.
 *
 * Nothing should be left over. The one refund larger than the tender — a late
 * partner's payment beyond a cheaper stand's price — arrives without its
 * late-partner part, which the grant records and the late-partner figure
 * absorbs instead (`repricing-refund-ledger.ts`). Anything left despite that
 * is dropped by the tender's clamp rather than turned into a negative cover.
 */
export function attributeRepricingRefunds(input: {
  refundedAmount: number;
  invoices: readonly RefundAttributionInvoice[];
}): Map<number, number> {
  const attributed = new Map<number, number>();
  let remaining = Math.max(0, roundMoney(input.refundedAmount));
  for (const invoice of [...input.invoices].sort((a, b) => a.id - b.id)) {
    const share = Math.min(
      remaining,
      Math.max(0, roundMoney(invoice.tenderedAmount)),
    );
    attributed.set(invoice.id, share);
    remaining = roundMoney(remaining - share);
  }
  return attributed;
}

/**
 * What `settleInvoiceShortfall` would actually write off.
 *
 * Not `outstandingAmount`: that command settles the invoice down to everything
 * tendered *including* a voucher still in review, because approving it is part
 * of the same command. On the ordinary credited reservation — some credits
 * plus one closing voucher — the outstanding balance is large and the write-off
 * is zero, so gating a control on the outstanding balance offered an action the
 * server then refused.
 */
export function shortfallWriteOff(tender: InvoiceTender): number {
  const settled = roundMoney(tender.coveredAmount + tender.submittedCashAmount);
  return Math.max(0, roundMoney(tender.totalAmount - settled));
}

export type CreditReleasePreview = {
  /** Every unreversed credit allocation on the cobro — what is released. */
  creditAmount: number;
  /**
   * The part of those credits a repricing already handed back as a refund,
   * which the release takes out again rather than returning twice.
   */
  alreadyReturnedAmount: number;
  /** What actually reaches the wallet. */
  returnedAmount: number;
  /** The cobro's outstanding balance once the credits are gone. */
  nextOutstandingAmount: number;
};

/**
 * What "Devolver créditos" will do to this cobro, for the dialog to say before
 * the admin confirms.
 *
 * Mirrors `releaseReservationInvoiceCreditsInTx`: every allocation is released
 * whole, and the refund netted against this cobro comes out of those credits
 * first — a refund larger than them was partly funded by cash, which a release
 * never hands back, so that part stays. Exact whenever the refund and the
 * credits are the same person's, which is every cobro the current creation
 * paths make; the server's result says the final figure regardless.
 */
export function creditReleasePreview(
  tender: InvoiceTender,
): CreditReleasePreview {
  const creditAmount = roundMoney(tender.confirmedCreditAmount);
  const alreadyReturnedAmount = Math.min(
    creditAmount,
    Math.max(0, roundMoney(tender.refundedAmount)),
  );
  const returnedAmount = roundMoney(creditAmount - alreadyReturnedAmount);
  return {
    creditAmount,
    alreadyReturnedAmount,
    returnedAmount,
    // Coverage drops by what actually leaves, not by the gross credits: the
    // refunded part had already left it.
    nextOutstandingAmount: Math.max(
      0,
      roundMoney(tender.totalAmount - (tender.coveredAmount - returnedAmount)),
    ),
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
  refundedAmount: 0,
  submittedCashAmount: 0,
  coveredAmount: 0,
  outstandingAmount: 0,
  pendingZeroValueRequest: false,
};
