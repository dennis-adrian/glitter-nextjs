import type { InvoiceStatus } from "@/app/data/invoices/definitions";
import type { InvoiceTender } from "@/app/lib/payments/tender";

/**
 * How an invoice's settlement reads to a human.
 *
 * Derived, never stored. `invoices.status` stays the four-value settlement
 * state it has always been; partial coverage is a fact about the tender rows,
 * and giving it a second home in the enum would create two sources of truth
 * for the same thing.
 *
 * This replaces `DisplayPaymentStatus`, which the reservations table used and
 * the payments table did not, so the two screens disagreed about which states
 * exist.
 */
export type CoverageState =
  | "unpaid"
  | "partial"
  | "under_review"
  | "overdue"
  | "paid"
  | "cancelled";

export type CoverageInput = {
  invoiceStatus: InvoiceStatus;
  reservationStatus: string;
  tender: Pick<
    InvoiceTender,
    "totalAmount" | "coveredAmount" | "submittedCashAmount"
  >;
  dueAt: Date | string | null;
  now?: Date;
};

const LABELS: Record<CoverageState, string> = {
  unpaid: "Sin pagar",
  partial: "Parcial",
  under_review: "En revisión",
  overdue: "Atrasado",
  paid: "Pagado",
  cancelled: "Cancelado",
};

export function getCoverageLabel(state: CoverageState): string {
  return LABELS[state];
}

function toDate(value: Date | string | null): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Overdue reads `invoices.due_at`.
 *
 * The previous helper recomputed it as `createdAt + 5 days`, so a deadline an
 * admin had explicitly extended still showed as overdue — `extendReservationPaymentDeadline`
 * writes `due_at` and nothing read it.
 */
export function deriveCoverageState(input: CoverageInput): CoverageState {
  const { invoiceStatus, reservationStatus, tender } = input;

  if (invoiceStatus === "cancelled") return "cancelled";
  if (invoiceStatus === "paid") return "paid";

  const hasSubmittedProof =
    invoiceStatus === "verification_payment" || tender.submittedCashAmount > 0;
  if (hasSubmittedProof) return "under_review";

  const dueAt = toDate(input.dueAt);
  const now = input.now ?? new Date();
  const isOverdue =
    dueAt != null &&
    dueAt.getTime() < now.getTime() &&
    reservationStatus !== "accepted";
  if (isOverdue) return "overdue";

  return tender.coveredAmount > 0 ? "partial" : "unpaid";
}

export const COVERAGE_FILTER_OPTIONS: {
  value: CoverageState;
  label: string;
}[] = [
  { value: "unpaid", label: LABELS.unpaid },
  { value: "partial", label: LABELS.partial },
  { value: "under_review", label: LABELS.under_review },
  { value: "overdue", label: LABELS.overdue },
  { value: "paid", label: LABELS.paid },
  { value: "cancelled", label: LABELS.cancelled },
];
