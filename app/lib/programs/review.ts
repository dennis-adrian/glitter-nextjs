/**
 * Which review decisions an admin may take on a purchase.
 *
 * Pure, like `vouchers.ts`, so the queue UI and the mutating actions agree on
 * what is offerable. The action is the one that counts — the list is rendered
 * from data that may be seconds stale.
 *
 * See docs/ARCHITECTURE-paid-programs-and-sessions.md §7.2.
 */

import type { SessionPurchaseStatus } from "@/app/lib/programs/definitions";

export type ReviewDecision = "approve" | "reject" | "request_changes";

export type ReviewBlocker =
  | "not_payable"
  | "no_voucher"
  | "already_resolved"
  | "not_reviewable";

export const REVIEW_BLOCKER_LABELS: Record<ReviewBlocker, string> = {
  not_payable: "Esta inscripción no tiene un pago que revisar",
  no_voucher: "Todavía no hay comprobante que revisar",
  already_resolved: "Esta compra ya fue resuelta",
  not_reviewable: "Esta compra no está en revisión",
};

/**
 * Statuses a decision can be taken from.
 *
 * `changes_requested` is included: the team can change its mind and approve or
 * reject without waiting for another upload — the voucher they already have is
 * enough to decide on. Approving from `pending_upload` is deliberately absent;
 * there would be nothing to have reviewed.
 */
const REVIEWABLE_STATUSES: SessionPurchaseStatus[] = [
  "under_verification",
  "changes_requested",
];

const RESOLVED_STATUSES: SessionPurchaseStatus[] = [
  "approved",
  "rejected",
  "expired",
  "cancelled",
];

export type ReviewSubject = {
  paymentMode: "bank_qr" | "free";
  status: SessionPurchaseStatus;
  /** Vouchers on file. Nothing can be decided without at least one. */
  voucherCount: number;
};

export type ReviewCheck =
  | { allowed: true }
  | { allowed: false; blocker: ReviewBlocker };

export function resolveReviewDecision(
  purchase: ReviewSubject,
  decision: ReviewDecision,
): ReviewCheck {
  if (purchase.paymentMode !== "bank_qr") {
    return { allowed: false, blocker: "not_payable" };
  }

  // Checked before reviewability so a second click on an already-approved row
  // says "already resolved" rather than the vaguer "not in review".
  if (RESOLVED_STATUSES.includes(purchase.status)) {
    return { allowed: false, blocker: "already_resolved" };
  }

  if (!REVIEWABLE_STATUSES.includes(purchase.status)) {
    return { allowed: false, blocker: "not_reviewable" };
  }

  if (purchase.voucherCount < 1) {
    return { allowed: false, blocker: "no_voucher" };
  }

  // `decision` does not narrow the rules today — every decision is available
  // from every reviewable status. It is a parameter so that adding one that
  // *is* restricted (a partial refund, say) has an obvious place to live.
  void decision;

  return { allowed: true };
}

/** The status a decision moves the purchase to. */
export const REVIEW_DECISION_STATUS: Record<
  ReviewDecision,
  SessionPurchaseStatus
> = {
  approve: "approved",
  reject: "rejected",
  request_changes: "changes_requested",
};
