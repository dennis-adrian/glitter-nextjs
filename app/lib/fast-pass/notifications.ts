import "server-only";

import { DateTime } from "luxon";

import FastPassApprovedEmailTemplate from "@/app/emails/fast-pass-approved";
import FastPassPurchaseLinkEmailTemplate from "@/app/emails/fast-pass-purchase-link";
import FastPassVoucherChangesEmailTemplate from "@/app/emails/fast-pass-voucher-changes";
import FastPassVoucherReceivedEmailTemplate from "@/app/emails/fast-pass-voucher-received";
import FastPassInternalTransactionEmailTemplate from "@/app/emails/fast-pass-internal-transaction";
import type { FestivalBase } from "@/app/lib/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import { formatMoney } from "@/app/lib/programs/pricing";
import { generateQrBuffer } from "@/app/lib/utils";
import { sendEmail } from "@/app/vendors/resend";

const FROM = "Equipo Glitter <entradas@productoraglitter.com>";

function baseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(
    /\/+$/,
    "",
  );
  if (configured) return configured;

  const vercel = process.env.VERCEL_URL?.trim().replace(/\/+$/, "");
  if (vercel) return `https://${vercel}`;

  if (process.env.NODE_ENV === "development") return "http://localhost:3000";

  throw new Error("FastPass notification base URL is not configured");
}

export function buildSecureLinkUrl(
  purchaseId: number,
  accessToken: string,
): string {
  return `${baseUrl()}/fast-pass/purchases/${purchaseId}?token=${accessToken}`;
}

export function buildBuyerLandingUrl(options: {
  purchaseId: number;
  accessToken?: string | null;
}): string {
  if (options.accessToken) {
    return buildSecureLinkUrl(options.purchaseId, options.accessToken);
  }
  return `${baseUrl()}/fast-pass/recover?purchaseId=${options.purchaseId}`;
}

function buildDayLabel(date: Date): string {
  return formatDate(date).toLocaleString(DateTime.DATE_MED);
}

export async function sendCheckoutSecureLinkEmail(input: {
  purchaseId: number;
  buyerName: string;
  buyerEmail: string;
  festivalDayLabel: string;
  holdExpiresAt: Date;
  totalAmount: number;
  accessToken: string;
  /**
   * Distinguishes a re-send from the original checkout email. Without it Resend
   * treats a link recovery as a replay and never delivers the rotated token.
   */
  deliveryKey?: string;
  festivalType: FestivalBase["festivalType"];
}): Promise<boolean> {
  try {
    await sendEmail(
      {
        from: FROM,
        to: [input.buyerEmail],
        subject: "Tu reserva de Pase Rápido — sube tu comprobante",
        react: FastPassPurchaseLinkEmailTemplate({
          buyerName: input.buyerName,
          festivalDayLabel: input.festivalDayLabel,
          holdExpiresAtLabel: formatDate(input.holdExpiresAt).toLocaleString(
            DateTime.DATETIME_MED,
          ),
          totalLabel: formatMoney(input.totalAmount),
          secureLinkUrl: buildSecureLinkUrl(
            input.purchaseId,
            input.accessToken,
          ),
          festivalType: input.festivalType,
        }),
      },
      {
        idempotencyKey: input.deliveryKey
          ? `fast-pass-checkout-link/${input.purchaseId}/${input.deliveryKey}`
          : `fast-pass-checkout-link/${input.purchaseId}`,
      },
    );
    return true;
  } catch (error) {
    console.error("FastPass checkout link email failed", {
      purchaseId: input.purchaseId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}

export async function sendVoucherReceivedEmail(input: {
  purchaseId: number;
  buyerName: string;
  buyerEmail: string;
  festivalDayLabel: string;
  paidCount: number;
  totalAmount: number;
  version: number;
  landingUrl: string | null;
  festivalType: FestivalBase["festivalType"];
}): Promise<boolean> {
  try {
    await sendEmail(
      {
        from: FROM,
        to: [input.buyerEmail],
        subject:
          input.version === 1
            ? "Recibimos tu comprobante de Pase Rápido"
            : "Recibimos tu nuevo comprobante de Pase Rápido",
        react: FastPassVoucherReceivedEmailTemplate({
          buyerName: input.buyerName,
          festivalDayLabel: input.festivalDayLabel,
          paidCount: input.paidCount,
          totalLabel: formatMoney(input.totalAmount),
          secureLinkUrl: input.landingUrl,
          isReplacement: input.version > 1,
          festivalType: input.festivalType,
        }),
      },
      {
        idempotencyKey: `fast-pass-voucher-received/${input.purchaseId}/${input.version}`,
      },
    );
    return true;
  } catch (error) {
    console.error("FastPass voucher received email failed", {
      purchaseId: input.purchaseId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}

export async function sendVoucherChangesEmail(input: {
  purchaseId: number;
  buyerName: string;
  buyerEmail: string;
  festivalDayLabel: string;
  reason: string;
  landingUrl: string | null;
  correctionExpiresAt: Date;
  festivalType: FestivalBase["festivalType"];
}): Promise<boolean> {
  try {
    await sendEmail(
      {
        from: FROM,
        to: [input.buyerEmail],
        subject: "Necesitamos un nuevo comprobante para tu Pase Rápido",
        react: FastPassVoucherChangesEmailTemplate({
          buyerName: input.buyerName,
          festivalDayLabel: input.festivalDayLabel,
          reason: input.reason,
          deadlineLabel: formatDate(input.correctionExpiresAt).toLocaleString(
            DateTime.DATETIME_MED,
          ),
          secureLinkUrl: input.landingUrl,
          festivalType: input.festivalType,
        }),
      },
      {
        idempotencyKey: `fast-pass-voucher-changes/${input.purchaseId}/${input.correctionExpiresAt.toISOString()}`,
      },
    );
    return true;
  } catch (error) {
    console.error("FastPass voucher changes email failed", {
      purchaseId: input.purchaseId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}

export async function sendPaymentApprovedEmail(input: {
  purchaseId: number;
  buyerName: string;
  buyerEmail: string;
  festivalDayLabel: string;
  holderLabel: string;
  childCount: number;
  ticketCode: string;
  landingUrl: string | null;
  festivalType: FestivalBase["festivalType"];
}): Promise<boolean> {
  try {
    const qrBuffer = await generateQrBuffer(input.ticketCode);
    const qrAttachment = {
      filename: "pase-rapido-qr.png",
      content: qrBuffer,
      content_id: "fast-pass-ticket-qrcode",
    };

    await sendEmail(
      {
        from: FROM,
        to: [input.buyerEmail],
        subject: "Tu Pase Rápido está confirmado",
        react: FastPassApprovedEmailTemplate({
          buyerName: input.buyerName,
          festivalDayLabel: input.festivalDayLabel,
          holderLabel: input.holderLabel,
          childCount: input.childCount,
          ticketCode: input.ticketCode,
          secureLinkUrl: input.landingUrl,
          festivalType: input.festivalType,
        }),
        attachments: [qrAttachment],
      },
      {
        idempotencyKey: `fast-pass-approved/${input.purchaseId}/${input.ticketCode}`,
      },
    );
    return true;
  } catch (error) {
    console.error("FastPass approval email failed", {
      purchaseId: input.purchaseId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}

export async function sendOnSiteSaleNotification(input: {
  recipients: string[];
  purchaseId: number;
  transactionId: number;
  festivalDayLabel: string;
  amount: number;
  paymentMethodLabel: string;
  paidCount: number;
  childCount: number;
  sellerName: string;
  occurredAt: Date;
  hasProof: boolean;
  festivalType: FestivalBase["festivalType"];
}): Promise<boolean> {
  if (input.recipients.length === 0) return true;
  try {
    await sendEmail(
      {
        from: FROM,
        to: input.recipients,
        subject: `Nueva venta en sitio de Pase Rápido #${input.purchaseId}`,
        react: FastPassInternalTransactionEmailTemplate({
          title: "Venta en sitio registrada",
          preview: `Venta #${input.purchaseId} por ${formatMoney(input.amount)}`,
          details: [
            { label: "Día", value: input.festivalDayLabel },
            { label: "Compra", value: `#${input.purchaseId}` },
            { label: "Transacción", value: `#${input.transactionId}` },
            { label: "Monto", value: formatMoney(input.amount) },
            { label: "Método", value: input.paymentMethodLabel },
            { label: "Pases pagos", value: String(input.paidCount) },
            { label: "Menores", value: String(input.childCount) },
            { label: "Vendedor", value: input.sellerName },
            {
              label: "Fecha",
              value: formatDate(input.occurredAt).toLocaleString(
                DateTime.DATETIME_MED,
              ),
            },
            {
              label: "Comprobante",
              value: input.hasProof ? "Adjunto en el sistema" : "No adjunto",
            },
          ],
          festivalType: input.festivalType,
        }),
      },
      { idempotencyKey: `fast-pass-onsite-sale/${input.transactionId}` },
    );
    return true;
  } catch (error) {
    console.error("FastPass internal sale notification failed", {
      purchaseId: input.purchaseId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}

export async function sendCancellationNotification(input: {
  recipients: string[];
  purchaseId: number;
  originalTransactionId: number;
  cancellationTransactionId: number;
  festivalDayLabel: string;
  amount: number;
  reason: string;
  adminName: string;
  occurredAt: Date;
  festivalType: FestivalBase["festivalType"];
}): Promise<boolean> {
  if (input.recipients.length === 0) return true;
  try {
    await sendEmail(
      {
        from: FROM,
        to: input.recipients,
        subject: `Cancelación de venta Pase Rápido #${input.purchaseId}`,
        react: FastPassInternalTransactionEmailTemplate({
          title: "Transacción de cancelación registrada",
          preview: `Cancelación de ${formatMoney(input.amount)}`,
          details: [
            { label: "Día", value: input.festivalDayLabel },
            { label: "Compra", value: `#${input.purchaseId}` },
            {
              label: "Venta original",
              value: `#${input.originalTransactionId}`,
            },
            {
              label: "Cancelación",
              value: `#${input.cancellationTransactionId}`,
            },
            { label: "Monto", value: formatMoney(input.amount) },
            { label: "Motivo", value: input.reason },
            { label: "Administrador", value: input.adminName },
            {
              label: "Fecha",
              value: formatDate(input.occurredAt).toLocaleString(
                DateTime.DATETIME_MED,
              ),
            },
          ],
          festivalType: input.festivalType,
        }),
      },
      {
        idempotencyKey: `fast-pass-cancellation/${input.cancellationTransactionId}`,
      },
    );
    return true;
  } catch (error) {
    console.error("FastPass cancellation notification failed", {
      purchaseId: input.purchaseId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}

export { buildDayLabel };
