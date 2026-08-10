import "server-only";

import { DateTime } from "luxon";
import type React from "react";

import ProgramPurchaseLinkEmailTemplate from "@/app/emails/program-purchase-link";
import ProgramRegistrationEmailTemplate from "@/app/emails/program-registration";
import ProgramSessionReminderEmailTemplate from "@/app/emails/program-session-reminder";
import ProgramSignupForAdminsEmailTemplate from "@/app/emails/program-signup-for-admins";
import ProgramVoucherChangesEmailTemplate from "@/app/emails/program-voucher-changes";
import ProgramVoucherReceivedEmailTemplate from "@/app/emails/program-voucher-received";
import ProgramWaitlistInvitationEmailTemplate from "@/app/emails/program-waitlist-invitation";
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

/**
 * The origin every outbound link is built on.
 *
 * An unset *or empty* `NEXT_PUBLIC_BASE_URL` both count as missing: `??` only
 * catches `undefined`, so an empty value used to survive and produce relative
 * links that are dead in an email client. `VERCEL_URL` is set on every
 * deployment, which is what keeps the localhost fallback — useful in local
 * development, useless in an inbox — out of anything deployed.
 *
 * Deliberately does not throw: `buildSecureLinkUrl` is also called while
 * rendering the buyer's own purchase page, and a misconfigured environment
 * should degrade to a wrong link there, not a 500.
 */
function baseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(
    /\/+$/,
    "",
  );
  if (configured) return configured;

  const vercel = process.env.VERCEL_URL?.trim().replace(/\/+$/, "");
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
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
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}

export type VoucherReceivedLine = {
  sessionTitle: string;
  sessionType: SessionType;
  startsAt: Date;
  endsAt: Date;
  unitPrice: number;
};

export type VoucherReceivedEmailInput = {
  purchaseId: number;
  buyerName: string;
  buyerEmail: string;
  /** Every line in the purchase, in line order. Never empty. */
  lines: VoucherReceivedLine[];
  totalAmount: number;
  promo?: {
    code: string;
    partnerName: string;
    discountPercent: number;
    discountAmount: number;
  } | null;
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
        subject:
          input.lines.length > 1
            ? `Recibimos tu comprobante para ${input.lines.length} sesiones`
            : `Recibimos tu comprobante para ${input.lines[0]?.sessionTitle}`,
        react: ProgramVoucherReceivedEmailTemplate({
          attendeeName: input.buyerName,
          sessions: input.lines.map((line) => ({
            title: line.sessionTitle,
            typeLabel: SESSION_TYPE_LABELS[line.sessionType],
            scheduleLabel: buildScheduleLabel(line.startsAt, line.endsAt),
            priceLabel: formatMoney(line.unitPrice),
          })),
          totalLabel: formatMoney(input.totalAmount),
          promoLabel: input.promo
            ? `Código ${input.promo.code} · ${input.promo.partnerName} · ${input.promo.discountPercent}% (ahorro ${formatMoney(input.promo.discountAmount)})`
            : null,
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

export type AdminNewSignupEmailInput = {
  purchaseId: number;
  attendeeName: string;
  adminEmails: string[];
  lines: VoucherReceivedLine[];
  totalAmount: number;
  promo?: VoucherReceivedEmailInput["promo"];
};

/** Notifies admins that a new paid signup is ready for payment review. */
export async function sendAdminNewSignupEmail(
  input: AdminNewSignupEmailInput,
): Promise<boolean> {
  if (input.adminEmails.length === 0) return true;

  try {
    await sendEmail(
      {
        from: "Equipo Glitter <entradas@productoraglitter.com>",
        to: input.adminEmails,
        subject:
          input.lines.length > 1
            ? `Nueva inscripción a ${input.lines.length} sesiones`
            : `Nueva inscripción a ${input.lines[0]?.sessionTitle}`,
        react: ProgramSignupForAdminsEmailTemplate({
          attendeeName: input.attendeeName,
          sessions: input.lines.map((line) => ({
            title: line.sessionTitle,
            typeLabel: SESSION_TYPE_LABELS[line.sessionType],
            scheduleLabel: buildScheduleLabel(line.startsAt, line.endsAt),
          })),
          totalLabel: formatMoney(input.totalAmount),
          promoLabel: input.promo
            ? `Código ${input.promo.code} · ${input.promo.partnerName} · ${input.promo.discountPercent}% (ahorro ${formatMoney(input.promo.discountAmount)})`
            : null,
          reviewUrl: `${baseUrl()}/dashboard/programs/purchases`,
        }) as React.ReactElement,
      },
      {
        idempotencyKey: `program-admin-new-signup-${input.purchaseId}`,
      },
    );

    return true;
  } catch (error) {
    console.error("Admin new signup email failed", {
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

/** `/programs/waitlist/12?token=…` — where an invited person claims the seat. */
export function buildWaitlistInvitationUrl(
  occurrenceId: number,
  token: string,
): string {
  return `${baseUrl()}/programs/waitlist/${occurrenceId}?token=${token}`;
}

export type WaitlistInvitationEmailInput = {
  entryId: number;
  occurrenceId: number;
  buyerName: string;
  buyerEmail: string;
  sessionTitle: string;
  startsAt: Date;
  endsAt: Date;
  expiresAt: Date;
  /** Raw token — sent once, stored only as a digest. */
  token: string;
};

/** Offers a released seat. Never throws. */
export async function sendWaitlistInvitationEmail(
  input: WaitlistInvitationEmailInput,
): Promise<boolean> {
  try {
    await sendEmail(
      {
        from: "Equipo Glitter <entradas@productoraglitter.com>",
        to: [input.buyerEmail],
        subject: `Se liberó un cupo en ${input.sessionTitle}`,
        react: ProgramWaitlistInvitationEmailTemplate({
          buyerName: input.buyerName,
          sessionTitle: input.sessionTitle,
          scheduleLabel: buildScheduleLabel(input.startsAt, input.endsAt),
          deadlineLabel: formatDate(input.expiresAt).toLocaleString(
            DateTime.DATETIME_MED,
          ),
          invitationUrl: buildWaitlistInvitationUrl(
            input.occurrenceId,
            input.token,
          ),
        }) as React.ReactElement,
      },
      {
        // Keyed on the deadline: re-inviting the same person mints a new token
        // with a new window, and that is a genuinely different message.
        idempotencyKey: `program-waitlist-invite-${input.entryId}-${input.expiresAt.getTime()}`,
      },
    );

    return true;
  } catch (error) {
    console.error("Waitlist invitation email failed", {
      entryId: input.entryId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}

export type SessionDayReminderLine = {
  sessionTitle: string;
  sessionType: SessionType;
  programName: string;
  startsAt: Date;
  endsAt: Date;
  venueName: string | null;
  room: string | null;
  ticketCode: string;
};

export type SessionDayReminderEmailInput = {
  attendeeName: string;
  attendeeEmail: string;
  /** Today's sessions for this person, chronological. Never empty. */
  lines: SessionDayReminderLine[];
  /** True when a ticket is tied to an account, so `/my_programs` will work. */
  hasAccount: boolean;
  /** Keys the send: one reminder per person per day, retries included. */
  idempotencyKey: string;
};

/**
 * Reminds someone, on the morning of, that they are expected today.
 *
 * Swallows failures like every other send in this module: a reminder is a
 * courtesy on top of a ticket that already exists, and a mail outage must not
 * turn a scheduled sweep into a 500 that hides the rest of the run.
 *
 * Returns whether it went out so the sweep can report a truthful count.
 */
export async function sendSessionDayReminderEmail(
  input: SessionDayReminderEmailInput,
): Promise<boolean> {
  const first = input.lines[0];
  if (!first) return false;

  const isSingle = input.lines.length === 1;

  try {
    await sendEmail(
      {
        from: "Equipo Glitter <entradas@productoraglitter.com>",
        to: [input.attendeeEmail],
        subject: isSingle
          ? `Hoy es tu ${SESSION_TYPE_LABELS[first.sessionType].toLowerCase()}: ${first.sessionTitle}`
          : `Hoy tienes ${input.lines.length} sesiones con Glitter`,
        react: ProgramSessionReminderEmailTemplate({
          attendeeName: input.attendeeName,
          sessions: input.lines.map((line) => ({
            title: line.sessionTitle,
            typeLabel: SESSION_TYPE_LABELS[line.sessionType],
            programName: line.programName,
            scheduleLabel: buildScheduleLabel(line.startsAt, line.endsAt),
            venueLabel: buildVenueLabel(line.venueName, line.room),
            ticketCode: line.ticketCode,
          })),
          // A guest has no account to sign into, and the reminder carries no
          // token — only the buyer's original email does — so they get the
          // pointer back to it instead of a dead button.
          ticketsUrl: input.hasAccount ? `${baseUrl()}/my_programs` : null,
        }) as React.ReactElement,
      },
      { idempotencyKey: input.idempotencyKey },
    );

    return true;
  } catch (error) {
    console.error("Session day reminder email failed", {
      ticketCode: first.ticketCode,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}
