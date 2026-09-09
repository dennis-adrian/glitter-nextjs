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
  | "awaiting_confirmation"
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
  awaiting_confirmation: "Por confirmar",
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

  // Everything owed has been tendered and nobody has closed the cobro yet —
  // the state "Confirmar reserva" exists to resolve. Reached by correcting an
  // amount down to exactly the credits already applied, which the
  // AMOUNT_BELOW_CREDITS guard permits (it refuses only *below*). Neither
  // "Parcial" nor "Atrasado" is true of it: no money is missing, so a deadline
  // it has already met cannot make it late.
  //
  // A zero-amount cobro lands here too, and belongs here: it owes nothing and
  // is waiting on the same confirmation. It reads as pending only until the
  // participant asks for the zero-value entitlement, and calling that "Sin
  // pagar" — or, past its due date, "Atrasado" — names a debt that does not
  // exist. An absent tender never reaches this function; the coverage column
  // renders nothing at all for it.
  if (tender.coveredAmount >= tender.totalAmount) {
    return "awaiting_confirmation";
  }

  const dueAt = toDate(input.dueAt);
  const now = input.now ?? new Date();
  const isOverdue =
    dueAt != null &&
    dueAt.getTime() < now.getTime() &&
    reservationStatus !== "accepted";
  if (isOverdue) return "overdue";

  // Strictly between nothing and everything. The upper bound is what makes
  // "Parcial" honest.
  return tender.coveredAmount > 0 ? "partial" : "unpaid";
}

export const COVERAGE_FILTER_OPTIONS: {
  value: CoverageState;
  label: string;
}[] = [
  { value: "unpaid", label: LABELS.unpaid },
  { value: "partial", label: LABELS.partial },
  { value: "awaiting_confirmation", label: LABELS.awaiting_confirmation },
  { value: "under_review", label: LABELS.under_review },
  { value: "overdue", label: LABELS.overdue },
  { value: "paid", label: LABELS.paid },
  { value: "cancelled", label: LABELS.cancelled },
];
