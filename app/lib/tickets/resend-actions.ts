"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { isSuppressed } from "@/app/lib/emails/suppressions";
import { consumeActionRateLimit } from "@/app/lib/rate-limit";
import {
  canResendTicket,
  TICKET_RESEND_BLOCKER_LABELS,
} from "@/app/lib/tickets/resend";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { buildTicketIssuedEmail } from "@/app/lib/visitors/tickets";
import { sendEmail } from "@/app/vendors/resend";
import { assertSent, sendFailureType } from "@/app/vendors/resend-result";
import { db } from "@/db";
import { tickets } from "@/db/schema";

const ticketIdSchema = z.number().int().positive();

const NOT_FOUND_MESSAGE = "No encontramos esta entrada.";
const FAILURE_MESSAGE =
  "No pudimos reenviar la entrada. Intentá de nuevo en unos minutos.";
const SUPPRESSED_MESSAGE =
  "Este correo está bloqueado porque rebotó o lo marcaron como spam. Desbloquealo en Correos bloqueados y volvé a intentarlo.";

/**
 * Mails a festival ticket again, to the address stored on its visitor.
 *
 * Staff only: any server action can be called directly, and ticket ids are
 * sequential, so an open trigger would let anyone mail every visitor.
 * Rate-limited per ticket so repeated clicks cannot flood one inbox.
 *
 * Awaits the send instead of deferring it, because the dashboard reports the
 * real outcome.
 */
export async function resendTicketEmail(
  ticketIdInput: unknown,
): Promise<{ success: boolean; message: string }> {
  if (!(await requireAdminOrFestivalAdmin())) {
    return {
      success: false,
      message: TICKET_RESEND_BLOCKER_LABELS.not_staff,
    };
  }

  const parsed = ticketIdSchema.safeParse(ticketIdInput);
  if (!parsed.success) {
    return { success: false, message: NOT_FOUND_MESSAGE };
  }
  const ticketId = parsed.data;

  let ticket;
  try {
    ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      with: { visitor: true, festival: true },
    });
  } catch (error) {
    console.error("Ticket resend lookup failed", {
      ticketId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { success: false, message: FAILURE_MESSAGE };
  }
  if (!ticket) {
    return { success: false, message: NOT_FOUND_MESSAGE };
  }

  const check = canResendTicket({
    isStaff: true,
    festivalIsActive: ticket.festival.status === "active",
    ticketNumber: ticket.ticketNumber,
  });
  if (!check.allowed) {
    return {
      success: false,
      message: TICKET_RESEND_BLOCKER_LABELS[check.blocker],
    };
  }

  // Resend delivers nothing to an address that bounced or marked us as spam,
  // so sending would report a delivery that never happens.
  const suppressionUnknown = Symbol("ticketResendSuppressionUnknown");
  const suppressed = await isSuppressed(ticket.visitor.email).catch((error) => {
    console.error("Ticket resend suppression check failed", {
      ticketId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return suppressionUnknown;
  });
  if (suppressed === suppressionUnknown) {
    return { success: false, message: FAILURE_MESSAGE };
  }
  if (suppressed) {
    return { success: false, message: SUPPRESSED_MESSAGE };
  }

  const rateLimitUnavailable = Symbol("ticketResendRateLimitUnavailable");
  const allowed = await consumeActionRateLimit({
    key: `ticket-resend:ticket:${ticket.id}`,
    limit: 3,
    windowMs: 10 * 60_000,
  }).catch(() => rateLimitUnavailable);
  if (allowed === rateLimitUnavailable) {
    return { success: false, message: FAILURE_MESSAGE };
  }
  if (!allowed) {
    return {
      success: false,
      message:
        "Ya reenviamos esta entrada hace poco. Esperá unos minutos e intentá de nuevo.",
    };
  }

  const now = new Date();
  try {
    const result = await sendEmail(
      await buildTicketIssuedEmail({
        visitor: ticket.visitor,
        festival: ticket.festival,
        ticket,
      }),
      // A resend is a distinct delivery from the original and from the last
      // click.
      { idempotencyKey: `ticket-resend-${ticket.id}-${now.getTime()}` },
    );
    assertSent(result);
  } catch (error) {
    // The type only: a provider message can echo the recipient.
    console.error("Ticket resend email failed", {
      ticketId,
      errorType: sendFailureType(error),
    });
    return { success: false, message: FAILURE_MESSAGE };
  }

  return {
    success: true,
    message: `Enviamos la entrada a ${ticket.visitor.email}.`,
  };
}
