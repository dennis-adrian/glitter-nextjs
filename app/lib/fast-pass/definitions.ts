import {
  fastPassActivations,
  fastPassDaySettings,
  fastPassEvents,
  fastPassNotificationRecipients,
  fastPassPosOperators,
  fastPassPurchaseLines,
  fastPassPurchases,
  fastPassRefunds,
  fastPassTickets,
  fastPassTransactions,
  fastPassVouchers,
} from "@/db/schema";

export type FastPassDaySettings = typeof fastPassDaySettings.$inferSelect;
export type FastPassNotificationRecipient =
  typeof fastPassNotificationRecipients.$inferSelect;
export type FastPassPosOperator = typeof fastPassPosOperators.$inferSelect;
export type FastPassPurchase = typeof fastPassPurchases.$inferSelect;
export type FastPassPurchaseLine = typeof fastPassPurchaseLines.$inferSelect;
export type FastPassVoucher = typeof fastPassVouchers.$inferSelect;
export type FastPassTicket = typeof fastPassTickets.$inferSelect;
export type FastPassActivation = typeof fastPassActivations.$inferSelect;
export type FastPassTransaction = typeof fastPassTransactions.$inferSelect;
export type FastPassEvent = typeof fastPassEvents.$inferSelect;
export type FastPassRefund = typeof fastPassRefunds.$inferSelect;

export type FastPassChannel = FastPassPurchase["channel"];
export type FastPassPurchaseStatus = FastPassPurchase["status"];
export type FastPassPaymentMethod = FastPassPurchase["paymentMethod"];
export type FastPassTicketStatus = FastPassTicket["status"];
export type FastPassActivationMethod = FastPassActivation["method"];
export type FastPassTransactionType = FastPassTransaction["type"];
export type FastPassActorType = FastPassEvent["actorType"];
export type FastPassEventType = FastPassEvent["eventType"];
export type FastPassRefundStatus = FastPassRefund["status"];

export const FAST_PASS_PURCHASE_STATUS_LABELS: Record<
  FastPassPurchaseStatus,
  string
> = {
  pending_upload: "Esperando comprobante",
  under_verification: "En revisión",
  changes_requested: "Cambios solicitados",
  approved: "Aprobado",
  rejected: "Rechazado",
  expired: "Expirado",
  cancelled: "Cancelado",
};

export const FAST_PASS_TICKET_STATUS_LABELS: Record<
  FastPassTicketStatus,
  string
> = {
  valid: "Válido",
  activated: "Activado",
  cancelled: "Cancelado",
};

export const FAST_PASS_CHANNEL_LABELS: Record<FastPassChannel, string> = {
  online: "Online",
  on_site: "En sitio",
};

export const FAST_PASS_PAYMENT_METHOD_LABELS: Record<
  FastPassPaymentMethod,
  string
> = {
  bank_qr: "QR bancario",
  cash: "Efectivo",
};

export const FAST_PASS_TRANSACTION_TYPE_LABELS: Record<
  FastPassTransactionType,
  string
> = {
  sale: "Venta",
  cancellation: "Cancelación",
  refund: "Reembolso",
};

/** Public policy version accepted at online checkout. Bump when copy changes. */
export const FAST_PASS_POLICY_VERSION = "2026-08-02";

/** Fixed hold and correction-window duration for the MVP contract. */
export const FAST_PASS_HOLD_MINUTES = 20;

/** Max children aged 10 or under per paid adult. */
export const FAST_PASS_MAX_CHILDREN_PER_ADULT = 5;

/** Longest reason for adverse admin actions. */
export const FAST_PASS_REASON_MAX = 500;
