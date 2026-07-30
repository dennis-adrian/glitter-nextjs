/**
 * When a purchase will accept a payment proof.
 *
 * Pure so the page, the upload endpoint, and the confirming transaction can all
 * ask the same question and agree on the answer. Every one of them must — the
 * page decides whether to render the uploader, the endpoint decides whether to
 * accept bytes at all, and the transaction is the only one that counts.
 *
 * See docs/ARCHITECTURE-paid-programs-and-sessions.md §7.2.
 */

import type { SessionPurchaseStatus } from "@/app/lib/programs/definitions";

export type VoucherBlocker =
  | "not_payable"
  | "already_approved"
  | "hold_expired"
  | "purchase_closed";

export const VOUCHER_BLOCKER_LABELS: Record<VoucherBlocker, string> = {
  not_payable: "Esta inscripción no requiere pago",
  already_approved:
    "Tu pago ya fue aprobado; no necesitas subir otro comprobante",
  hold_expired: "Tu reserva expiró. Vuelve a inscribirte para tomar un cupo.",
  purchase_closed: "Esta compra ya no acepta comprobantes",
};

/**
 * Statuses that accept a voucher.
 *
 * `under_verification` is included so a buyer who spots a mistake can replace
 * the file before anyone reviews it, and `changes_requested` because being
 * asked for a better photo is precisely when a replacement is needed — roadmap
 * Phase 3 requires that state not to block one.
 */
const ACCEPTING_STATUSES: SessionPurchaseStatus[] = [
  "pending_upload",
  "under_verification",
  "changes_requested",
];

export type VoucherSubmissionSubject = {
  paymentMode: "bank_qr" | "free";
  status: SessionPurchaseStatus;
  holdExpiresAt: Date | null;
};

export type VoucherSubmissionCheck =
  | { allowed: true }
  | { allowed: false; blocker: VoucherBlocker };

export function resolveVoucherSubmission(
  purchase: VoucherSubmissionSubject,
  now: Date = new Date(),
): VoucherSubmissionCheck {
  if (purchase.paymentMode !== "bank_qr") {
    return { allowed: false, blocker: "not_payable" };
  }

  if (purchase.status === "approved") {
    return { allowed: false, blocker: "already_approved" };
  }

  if (!ACCEPTING_STATUSES.includes(purchase.status)) {
    return { allowed: false, blocker: "purchase_closed" };
  }

  /**
   * Only `pending_upload` is gated on the hold. Once a voucher is in, the seat
   * is held by the review itself (`isHoldingSeat` treats those statuses as
   * holding regardless of the deadline), so a buyer replacing a file mid-review
   * must not be turned away by a timestamp that no longer governs anything.
   */
  if (purchase.status === "pending_upload") {
    if (purchase.holdExpiresAt === null) {
      return { allowed: false, blocker: "hold_expired" };
    }
    if (purchase.holdExpiresAt.getTime() <= now.getTime()) {
      return { allowed: false, blocker: "hold_expired" };
    }
  }

  return { allowed: true };
}
