import type {
  FastPassDaySettings,
  FastPassPaymentMethod,
  FastPassPurchaseStatus,
  FastPassTicketStatus,
  FastPassTransactionType,
} from "@/app/lib/fast-pass/definitions";
import { FAST_PASS_HOLD_MINUTES } from "@/app/lib/fast-pass/definitions";

export type FastPassSaleChannel = "online" | "on_site";

export type FastPassSaleState =
  | "offering_disabled"
  | "festival_cancelled"
  | "channel_disabled"
  | "channel_paused"
  | "sales_not_started"
  | "sales_ended"
  | "on_sale";

export type FastPassSaleStateInput = {
  offeringEnabled: boolean;
  cancelledAt: Date | null;
  salesStartAt: Date | null;
  salesEndAt: Date | null;
  onlineSalesEnabled: boolean;
  onSiteSalesEnabled: boolean;
  onlineSalesPausedAt: Date | null;
  onSiteSalesPausedAt: Date | null;
};

export type ResolvedFastPassSaleState = {
  state: FastPassSaleState;
  isPurchasable: boolean;
};

export const FAST_PASS_SALE_STATE_LABELS: Record<FastPassSaleState, string> = {
  offering_disabled: "Oferta deshabilitada",
  festival_cancelled: "Festival cancelado",
  channel_disabled: "Canal deshabilitado",
  channel_paused: "Ventas pausadas",
  sales_not_started: "Ventas próximamente",
  sales_ended: "Ventas cerradas",
  on_sale: "En venta",
};

/**
 * Whether a channel accepts new purchases right now. Existing approved passes
 * remain valid when sales are paused or disabled.
 */
export function resolveFastPassSaleState(
  settings: FastPassSaleStateInput,
  channel: FastPassSaleChannel,
  now: Date = new Date(),
): ResolvedFastPassSaleState {
  if (!settings.offeringEnabled) {
    return { state: "offering_disabled", isPurchasable: false };
  }
  if (settings.cancelledAt !== null) {
    return { state: "festival_cancelled", isPurchasable: false };
  }

  const channelEnabled =
    channel === "online"
      ? settings.onlineSalesEnabled
      : settings.onSiteSalesEnabled;
  if (!channelEnabled) {
    return { state: "channel_disabled", isPurchasable: false };
  }

  const pausedAt =
    channel === "online"
      ? settings.onlineSalesPausedAt
      : settings.onSiteSalesPausedAt;
  if (pausedAt !== null) {
    return { state: "channel_paused", isPurchasable: false };
  }

  if (
    settings.salesStartAt !== null &&
    now.getTime() < settings.salesStartAt.getTime()
  ) {
    return { state: "sales_not_started", isPurchasable: false };
  }

  if (
    settings.salesEndAt !== null &&
    now.getTime() > settings.salesEndAt.getTime()
  ) {
    return { state: "sales_ended", isPurchasable: false };
  }

  return { state: "on_sale", isPurchasable: true };
}

export type FastPassHoldingSubject = {
  status: FastPassPurchaseStatus;
  holdExpiresAt: Date | null;
  correctionExpiresAt: Date | null;
  /**
   * Cancelled purchases that restored allocation no longer hold. When false or
   * unknown, capacity stays consumed even after financial cancellation.
   */
  allocationRestored?: boolean | null;
};

/**
 * Whether a purchase still consumes paid inventory / priority capacity as a hold.
 *
 * Approved purchases are counted separately via approved totals, not here.
 */
export function isFastPassPurchaseHolding(
  purchase: FastPassHoldingSubject,
  now: Date = new Date(),
): boolean {
  if (purchase.status === "under_verification") return true;

  if (purchase.status === "pending_upload") {
    return (
      purchase.holdExpiresAt !== null &&
      purchase.holdExpiresAt.getTime() > now.getTime()
    );
  }

  if (purchase.status === "changes_requested") {
    return (
      purchase.correctionExpiresAt !== null &&
      purchase.correctionExpiresAt.getTime() > now.getTime()
    );
  }

  return false;
}

export type VoucherBlocker =
  | "not_payable"
  | "already_approved"
  | "hold_expired"
  | "correction_expired"
  | "purchase_closed";

export const VOUCHER_BLOCKER_LABELS: Record<VoucherBlocker, string> = {
  not_payable: "Esta compra no requiere comprobante",
  already_approved: "Tu pago ya fue aprobado",
  hold_expired: "Tu reserva expiró. Volvé a comprar un Pase Rápido.",
  correction_expired: "El plazo para corregir el comprobante expiró",
  purchase_closed: "Esta compra ya no acepta comprobantes",
};

const VOUCHER_ACCEPTING: FastPassPurchaseStatus[] = [
  "pending_upload",
  "under_verification",
  "changes_requested",
];

export type VoucherSubmissionSubject = {
  channel: FastPassSaleChannel;
  paymentMethod: FastPassPaymentMethod;
  status: FastPassPurchaseStatus;
  holdExpiresAt: Date | null;
  correctionExpiresAt: Date | null;
  onSiteProofRequiredSnapshot?: boolean | null;
};

export type VoucherSubmissionCheck =
  | { allowed: true }
  | { allowed: false; blocker: VoucherBlocker };

export function resolveVoucherSubmission(
  purchase: VoucherSubmissionSubject,
  now: Date = new Date(),
): VoucherSubmissionCheck {
  if (purchase.paymentMethod !== "bank_qr") {
    return { allowed: false, blocker: "not_payable" };
  }

  if (purchase.status === "approved") {
    return { allowed: false, blocker: "already_approved" };
  }

  if (!VOUCHER_ACCEPTING.includes(purchase.status)) {
    return { allowed: false, blocker: "purchase_closed" };
  }

  if (purchase.status === "pending_upload") {
    if (
      purchase.holdExpiresAt === null ||
      purchase.holdExpiresAt.getTime() <= now.getTime()
    ) {
      return { allowed: false, blocker: "hold_expired" };
    }
  }

  if (purchase.status === "changes_requested") {
    if (
      purchase.correctionExpiresAt === null ||
      purchase.correctionExpiresAt.getTime() <= now.getTime()
    ) {
      return { allowed: false, blocker: "correction_expired" };
    }
  }

  return { allowed: true };
}

export type ReviewDecision = "approve" | "reject" | "request_changes";

export function reviewDecisionRequiresReason(
  decision: ReviewDecision,
): boolean {
  return decision !== "approve";
}

export type ReviewBlocker =
  | "no_voucher"
  | "already_resolved"
  | "not_reviewable"
  | "not_online";

export const REVIEW_BLOCKER_LABELS: Record<ReviewBlocker, string> = {
  no_voucher: "Todavía no hay comprobante que revisar",
  already_resolved: "Esta compra ya fue resuelta",
  not_reviewable: "Esta compra no está en revisión",
  not_online: "Solo se revisan compras online",
};

const REVIEWABLE: FastPassPurchaseStatus[] = [
  "under_verification",
  "changes_requested",
];

const RESOLVED: FastPassPurchaseStatus[] = [
  "approved",
  "rejected",
  "expired",
  "cancelled",
];

export type ReviewSubject = {
  channel: FastPassSaleChannel;
  status: FastPassPurchaseStatus;
  voucherCount: number;
};

export type ReviewCheck =
  | { allowed: true }
  | { allowed: false; blocker: ReviewBlocker };

export function resolveReviewDecision(
  purchase: ReviewSubject,
  decision: ReviewDecision,
): ReviewCheck {
  void decision;
  if (purchase.channel !== "online") {
    return { allowed: false, blocker: "not_online" };
  }
  if (RESOLVED.includes(purchase.status)) {
    return { allowed: false, blocker: "already_resolved" };
  }
  if (!REVIEWABLE.includes(purchase.status)) {
    return { allowed: false, blocker: "not_reviewable" };
  }
  if (purchase.voucherCount < 1) {
    return { allowed: false, blocker: "no_voucher" };
  }
  return { allowed: true };
}

export const REVIEW_DECISION_STATUS: Record<
  ReviewDecision,
  FastPassPurchaseStatus
> = {
  approve: "approved",
  reject: "rejected",
  request_changes: "changes_requested",
};

export type BuyerCancellationBlocker =
  | "not_online"
  | "voucher_already_submitted"
  | "hold_expired"
  | "not_cancellable";

export const BUYER_CANCELLATION_BLOCKER_LABELS: Record<
  BuyerCancellationBlocker,
  string
> = {
  not_online: "Solo se pueden cancelar compras online",
  voucher_already_submitted:
    "Ya subiste un comprobante. Si transferiste, esperá la revisión.",
  hold_expired: "La reserva ya expiró",
  not_cancellable: "Esta compra no se puede cancelar",
};

export type BuyerCancellationCheck =
  | { allowed: true }
  | { allowed: false; blocker: BuyerCancellationBlocker };

export function resolveBuyerCancellation(
  purchase: {
    channel: FastPassSaleChannel;
    status: FastPassPurchaseStatus;
    holdExpiresAt: Date | null;
    voucherSubmittedAt: Date | null;
  },
  now: Date = new Date(),
): BuyerCancellationCheck {
  if (purchase.channel !== "online") {
    return { allowed: false, blocker: "not_online" };
  }
  if (purchase.status !== "pending_upload") {
    if (purchase.voucherSubmittedAt !== null) {
      return { allowed: false, blocker: "voucher_already_submitted" };
    }
    return { allowed: false, blocker: "not_cancellable" };
  }
  if (
    purchase.holdExpiresAt === null ||
    purchase.holdExpiresAt.getTime() <= now.getTime()
  ) {
    return { allowed: false, blocker: "hold_expired" };
  }
  return { allowed: true };
}

export type ActivationBlocker =
  | "cancelled"
  | "already_activated"
  | "wrong_day"
  | "not_valid";

export const ACTIVATION_BLOCKER_LABELS: Record<ActivationBlocker, string> = {
  cancelled: "Este pase fue cancelado",
  already_activated: "Ya activado",
  wrong_day: "Este pase es para otro día del festival",
  not_valid: "Este pase no está listo para activar",
};

export type ActivationCheck =
  | { allowed: true }
  | { allowed: false; blocker: ActivationBlocker };

export function resolveActivation(
  ticket: {
    status: FastPassTicketStatus;
    festivalDateId: number;
  },
  festivalDateId: number,
): ActivationCheck {
  if (ticket.festivalDateId !== festivalDateId) {
    return { allowed: false, blocker: "wrong_day" };
  }
  if (ticket.status === "cancelled") {
    return { allowed: false, blocker: "cancelled" };
  }
  if (ticket.status === "activated") {
    return { allowed: false, blocker: "already_activated" };
  }
  if (ticket.status !== "valid") {
    return { allowed: false, blocker: "not_valid" };
  }
  return { allowed: true };
}

export type TransactionCancellationBlocker =
  | "not_a_sale"
  | "already_cancelled"
  | "amount_exceeds_sale";

export type TransactionCancellationCheck =
  | {
      allowed: true;
      restoresAllocation: boolean;
    }
  | { allowed: false; blocker: TransactionCancellationBlocker };

/**
 * Whether an admin may create a cancellation transaction against a sale.
 * Allocation is restored only when no wristband was issued, or staff confirms
 * every issued wristband was recovered.
 */
export function resolveTransactionCancellation(input: {
  transactionType: FastPassTransactionType;
  existingCancellationAmount: number;
  requestedCancellationAmount: number;
  saleAmount: number;
  hasActivation: boolean;
  wristbandsRecovered: boolean;
}): TransactionCancellationCheck {
  if (input.transactionType !== "sale") {
    return { allowed: false, blocker: "not_a_sale" };
  }
  if (input.existingCancellationAmount > 0) {
    return { allowed: false, blocker: "already_cancelled" };
  }
  if (input.requestedCancellationAmount > input.saleAmount) {
    return { allowed: false, blocker: "amount_exceeds_sale" };
  }

  const restoresAllocation = !input.hasActivation || input.wristbandsRecovered;

  return { allowed: true, restoresAllocation };
}

export function holdExpiresAtFromNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + FAST_PASS_HOLD_MINUTES * 60_000);
}

export function settingsToSaleInput(
  settings: Pick<
    FastPassDaySettings,
    | "offeringEnabled"
    | "cancelledAt"
    | "salesStartAt"
    | "salesEndAt"
    | "onlineSalesEnabled"
    | "onSiteSalesEnabled"
    | "onlineSalesPausedAt"
    | "onSiteSalesPausedAt"
  >,
): FastPassSaleStateInput {
  return settings;
}

export function isAffectedByFestivalCancellation(
  status: FastPassPurchaseStatus,
): boolean {
  return [
    "pending_upload",
    "under_verification",
    "changes_requested",
    "approved",
  ].includes(status);
}

export function validateOnSiteVisitorData(input: {
  required: boolean;
  holders: { firstName?: string; lastName?: string }[];
  buyerEmail?: string;
  buyerPhone?: string;
}): "holder_name" | "purchase_contact" | null {
  if (!input.required) return null;
  if (
    input.holders.some(
      (holder) => !holder.firstName?.trim() || !holder.lastName?.trim(),
    )
  ) {
    return "holder_name";
  }
  const hasBuyerEmail = Boolean(input.buyerEmail?.trim());
  const hasBuyerPhone = Boolean(input.buyerPhone?.trim());
  if (!hasBuyerEmail && !hasBuyerPhone) {
    return "purchase_contact";
  }
  return null;
}
