import "server-only";

import { DateTime } from "luxon";
import type React from "react";

import ProgramRegistrationEmailTemplate from "@/app/emails/program-registration";
import { formatDate } from "@/app/lib/formatters";
import { SESSION_TYPE_LABELS } from "@/app/lib/programs/definitions";
import type { SessionType } from "@/app/lib/programs/definitions";
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

/** `/programs/purchases/12?token=…` — the buyer's recovery link. */
export function buildSecureLinkUrl(
  purchaseId: number,
  accessToken: string,
): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  return `${baseUrl}/programs/purchases/${purchaseId}?token=${accessToken}`;
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
