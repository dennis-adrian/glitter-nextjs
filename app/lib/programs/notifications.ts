import "server-only";

import { DateTime } from "luxon";
import type React from "react";

import ProgramPurchaseLinkEmailTemplate from "@/app/emails/program-purchase-link";
import ProgramRegistrationEmailTemplate from "@/app/emails/program-registration";
import ProgramVoucherChangesEmailTemplate from "@/app/emails/program-voucher-changes";
import ProgramVoucherReceivedEmailTemplate from "@/app/emails/program-voucher-received";
import { formatDate } from "@/app/lib/formatters";
import { SESSION_TYPE_LABELS } from "@/app/lib/programs/definitions";
import type { SessionType } from "@/app/lib/programs/definitions";
import { formatMoney } from "@/app/lib/programs/pricing";
import { generateQrBuffer } from "@/app/lib/utils";
import { sendEmail } from "@/app/vendors/resend";

export type FreeRegistrationEmailInput = {
  purchaseId: number;
  attendeeName: string;
  attendeeEmail: string;
  programName: string;
  sessionTitle: string;
  sessionType: SessionType;
  startsAt: Date;
  endsAt: Date;
  venueName: string | null;
  room: string | null;
  ticketCode: string;
  accessToken: string;
};

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}

/** `/programs/purchases/12?token=…` — the buyer's recovery link. */
export function buildSecureLinkUrl(
  purchaseId: number,
  accessToken: string,
): string {
  return `${baseUrl()}/programs/purchases/${purchaseId}?token=${accessToken}`;
}

/**
 * The best link we can offer a buyer without a raw token.
 *
 * Only the checkout and the buyer's own upload carry the raw token; the
 * database keeps a digest, so an admin acting later cannot rebuild the secure
 * link. A signed-in buyer needs no token — ownership grants access — so they
 * get their profile area. A guest gets nothing, and the copy tells them to use
 * the link from their reservation email instead of showing a dead button.
 */
export function buildBuyerLandingUrl(options: {
  purchaseId: number;
  accessToken?: string | null;
  isSignedInBuyer: boolean;
}): string | null {
  if (options.accessToken) {
    return buildSecureLinkUrl(options.purchaseId, options.accessToken);
  }

  return options.isSignedInBuyer ? `${baseUrl()}/my_programs` : null;
}

function buildScheduleLabel(startsAt: Date, endsAt: Date): string {
  const start = formatDate(startsAt);
  const end = formatDate(endsAt);

  return `${start.toLocaleString(DateTime.DATETIME_MED)} — ${end.toLocaleString(
    DateTime.TIME_SIMPLE,
  )}`;
}

function buildVenueLabel(
  venueName: string | null,
  room: string | null,
): string | null {
  return [venueName, room].filter(Boolean).join(" · ") || null;
}

/**
 * Sends the registration confirmation with its QR.
 *
 * Deliberately swallows every failure. The registration is already committed by
 * the time this runs, and an unreachable mail provider must never look like a
 * failed registration — the attendee has a seat either way, and the secure link
 * is shown on the confirmation page precisely so email is not the only path to
 * the ticket.
 *
 * Returns whether the send succeeded so the caller can tell the buyer to use
 * the on-screen link instead.
 */
export async function sendFreeRegistrationEmail(
  input: FreeRegistrationEmailInput,
): Promise<boolean> {
  try {
    const qrBuffer = await generateQrBuffer(input.ticketCode);

    /**
     * `content_id` is what makes the `cid:` reference in the template resolve
     * to this image. Resend's API supports it, but the installed SDK's
     * `Attachment` type omits it — assigning through a variable keeps
     * TypeScript's excess-property check off an object literal, which is the
     * same thing `app/data/tickets/actions.ts` does for the festival ticket.
     */
    const qrAttachment = {
      filename: "entrada-qr.png",
      content: qrBuffer,
      content_id: "program-ticket-qrcode",
    };

    await sendEmail(
      {
        from: "Equipo Glitter <entradas@productoraglitter.com>",
        to: [input.attendeeEmail],
        subject: `Tu inscripción a ${input.sessionTitle} está confirmada`,
        react: ProgramRegistrationEmailTemplate({
          attendeeName: input.attendeeName,
          programName: input.programName,
          sessionTitle: input.sessionTitle,
          sessionTypeLabel: SESSION_TYPE_LABELS[input.sessionType],
          scheduleLabel: buildScheduleLabel(input.startsAt, input.endsAt),
          venueLabel: buildVenueLabel(input.venueName, input.room),
          ticketCode: input.ticketCode,
          secureLinkUrl: buildSecureLinkUrl(
            input.purchaseId,
            input.accessToken,
          ),
        }) as React.ReactElement,
        attachments: [qrAttachment],
      },
      {
        // Keyed on the ticket, so a retry of the same registration cannot
        // deliver a second copy.
        idempotencyKey: `program-registration-${input.purchaseId}-${input.ticketCode}`,
      },
    );

    return true;
  } catch (error) {
    console.error("Free registration email failed", {
      purchaseId: input.purchaseId,
      error,
    });
    return false;
  }
}

export type VoucherReceivedEmailInput = {
  purchaseId: number;
  buyerName: string;
  buyerEmail: string;
  sessionTitle: string;
  sessionType: SessionType;
  startsAt: Date;
  endsAt: Date;
  totalAmount: number;
  /** Voucher version, so a replacement reads correctly and keys the send. */
  version: number;
  landingUrl: string | null;
};

/**
 * Acknowledges a submitted payment proof.
 *
 * Swallows failures for the same reason `sendFreeRegistrationEmail` does: the
 * voucher is already recorded and the seat already held, so an unreachable mail
 * provider must not look like a failed submission.
 */
export async function sendVoucherReceivedEmail(
  input: VoucherReceivedEmailInput,
): Promise<boolean> {
  try {
    await sendEmail(
      {
        from: "Equipo Glitter <entradas@productoraglitter.com>",
        to: [input.buyerEmail],
        subject: `Recibimos tu comprobante para ${input.sessionTitle}`,
        react: ProgramVoucherReceivedEmailTemplate({
          attendeeName: input.buyerName,
          sessionTitle: input.sessionTitle,
          sessionTypeLabel: SESSION_TYPE_LABELS[input.sessionType],
          scheduleLabel: buildScheduleLabel(input.startsAt, input.endsAt),
          totalLabel: formatMoney(input.totalAmount),
          secureLinkUrl: input.landingUrl,
          isReplacement: input.version > 1,
        }) as React.ReactElement,
      },
      {
        // Keyed on the version: each replacement earns one acknowledgement,
        // and a retry of the same one does not.
        idempotencyKey: `program-voucher-received-${input.purchaseId}-v${input.version}`,
      },
    );

    return true;
  } catch (error) {
    console.error("Voucher received email failed", {
      purchaseId: input.purchaseId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}

export type VoucherChangesEmailInput = {
  purchaseId: number;
  buyerName: string;
  buyerEmail: string;
  sessionTitle: string;
  reason: string;
  landingUrl: string | null;
  /** Distinguishes repeat requests so each one is delivered. */
  requestedAt: Date;
};

/** Asks the buyer for a different payment proof. Never throws. */
export async function sendVoucherChangesEmail(
  input: VoucherChangesEmailInput,
): Promise<boolean> {
  try {
    await sendEmail(
      {
        from: "Equipo Glitter <entradas@productoraglitter.com>",
        to: [input.buyerEmail],
        subject: `Necesitamos otro comprobante para ${input.sessionTitle}`,
        react: ProgramVoucherChangesEmailTemplate({
          attendeeName: input.buyerName,
          sessionTitle: input.sessionTitle,
          reason: input.reason,
          secureLinkUrl: input.landingUrl,
        }) as React.ReactElement,
      },
      {
        idempotencyKey: `program-voucher-changes-${input.purchaseId}-${input.requestedAt.getTime()}`,
      },
    );

    return true;
  } catch (error) {
    console.error("Voucher changes email failed", {
      purchaseId: input.purchaseId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}

export type PaymentApprovedEmailInput = {
  purchaseId: number;
  attendeeName: string;
  attendeeEmail: string;
  programName: string;
  sessionTitle: string;
  sessionType: SessionType;
  startsAt: Date;
  endsAt: Date;
  venueName: string | null;
  room: string | null;
  ticketCode: string;
  landingUrl: string | null;
  /**
   * Distinguishes a deliberate re-delivery from the original approval. Without
   * it the idempotency key would suppress a support resend as a duplicate.
   */
  deliveryKey?: string;
};

/**
 * Delivers the QR after an admin approves the payment.
 *
 * Reuses the registration template rather than duplicating it: the Android
 * dark-mode defences around the QR are load-bearing and must not be forked.
 * Never throws — the ticket is already issued, and the buyer can reach it from
 * their secure link regardless.
 */
export async function sendPaymentApprovedEmail(
  input: PaymentApprovedEmailInput,
): Promise<boolean> {
  try {
    const qrBuffer = await generateQrBuffer(input.ticketCode);

    const qrAttachment = {
      filename: "entrada-qr.png",
      content: qrBuffer,
      content_id: "program-ticket-qrcode",
    };

    await sendEmail(
      {
        from: "Equipo Glitter <entradas@productoraglitter.com>",
        to: [input.attendeeEmail],
        subject: `Aprobamos tu pago para ${input.sessionTitle}`,
        react: ProgramRegistrationEmailTemplate({
          attendeeName: input.attendeeName,
          programName: input.programName,
          sessionTitle: input.sessionTitle,
          sessionTypeLabel: SESSION_TYPE_LABELS[input.sessionType],
          scheduleLabel: buildScheduleLabel(input.startsAt, input.endsAt),
          venueLabel: buildVenueLabel(input.venueName, input.room),
          ticketCode: input.ticketCode,
          secureLinkUrl: input.landingUrl,
          paymentApproved: true,
        }) as React.ReactElement,
        attachments: [qrAttachment],
      },
      {
        // Keyed on the ticket, so re-approval cannot deliver a second QR.
        idempotencyKey:
          `program-payment-approved-${input.purchaseId}-${input.ticketCode}` +
          (input.deliveryKey ? `-${input.deliveryKey}` : ""),
      },
    );

    return true;
  } catch (error) {
    console.error("Payment approved email failed", {
      purchaseId: input.purchaseId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}

export type PurchaseLinkEmailInput = {
  purchaseId: number;
  buyerName: string;
  buyerEmail: string;
  sessionTitle: string;
  secureLinkUrl: string;
  /** Keys the send so each resend is delivered, not deduped as a repeat. */
  resentAt: Date;
};

/** Sends a replacement secure link. Never throws. */
export async function sendPurchaseLinkEmail(
  input: PurchaseLinkEmailInput,
): Promise<boolean> {
  try {
    await sendEmail(
      {
        from: "Equipo Glitter <entradas@productoraglitter.com>",
        to: [input.buyerEmail],
        subject: `Tu enlace para ${input.sessionTitle}`,
        react: ProgramPurchaseLinkEmailTemplate({
          buyerName: input.buyerName,
          sessionTitle: input.sessionTitle,
          secureLinkUrl: input.secureLinkUrl,
        }) as React.ReactElement,
      },
      {
        idempotencyKey: `program-purchase-link-${input.purchaseId}-${input.resentAt.getTime()}`,
      },
    );

    return true;
  } catch (error) {
    console.error("Purchase link email failed", {
      purchaseId: input.purchaseId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}
