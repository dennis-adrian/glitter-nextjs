/**
 * What an admin may do to a purchase outside the review decision.
 *
 * Pure, like `review.ts` and `vouchers.ts`, so the dashboard and the mutating
 * actions agree on what is offerable.
 *
 * See docs/ARCHITECTURE-paid-programs-and-sessions.md §7.2.
 */

import type { SessionPurchaseStatus } from "@/app/lib/programs/definitions";

export type SupportBlocker = "already_closed" | "no_recipient";

export const SUPPORT_BLOCKER_LABELS: Record<SupportBlocker, string> = {
  already_closed: "Esta compra ya está cerrada",
  no_recipient: "Esta compra no tiene un correo al que escribir",
};

/**
 * Statuses an admin cancellation cannot act on.
 *
 * `approved` is deliberately absent — cancelling a confirmed purchase is
 * exactly the support case this exists for (a duplicate payment, a fraudulent
 * voucher found later), and it must cancel the issued tickets with it.
 */
const CLOSED_STATUSES: SessionPurchaseStatus[] = [
  "rejected",
  "expired",
  "cancelled",
];

export type SupportSubject = {
  status: SessionPurchaseStatus;
};

export type SupportCheck =
  | { allowed: true }
  | { allowed: false; blocker: SupportBlocker };

export function canCancelAsAdmin(purchase: SupportSubject): SupportCheck {
  if (CLOSED_STATUSES.includes(purchase.status)) {
    return { allowed: false, blocker: "already_closed" };
  }

  return { allowed: true };
}

/**
 * Whether resending is worth offering.
 *
 * Allowed from any status: the buyer may need their link back while pending,
 * mid-review, or long after approval. Only a missing recipient blocks it, and
 * that is resolved by the caller which knows the buyer's address.
 */
export function canResend(hasRecipient: boolean): SupportCheck {
  return hasRecipient
    ? { allowed: true }
    : { allowed: false, blocker: "no_recipient" };
}
