import "server-only";

import type React from "react";
import type { CreateEmailOptions } from "resend";

import type { TicketBase } from "@/app/data/tickets/actions";
import type { VisitorBase } from "@/app/data/visitors/actions";
import TicketEmailTemplate from "@/app/emails/ticket";
import type { FestivalBase } from "@/app/lib/festivals/definitions";
import { getTicketCode } from "@/app/lib/tickets/utils";
import { generateQrBuffer } from "@/app/lib/utils";

/**
 * The festival ticket email, QR attached inline.
 *
 * One builder so the registration email and a staff resend cannot drift
 * apart. It sends to whatever `visitor.email` it is given: the staff resend
 * passes the stored visitor row, but `createTicket` still passes the visitor
 * and festival objects its client caller sent, so that path trusts the
 * caller's address, name and festival text.
 *
 * Lives outside `app/data/tickets/actions.ts` on purpose: every export of a
 * "use server" file is a public server action, and this one would take a
 * caller-built visitor.
 */
export async function buildTicketEmail(input: {
  visitor: VisitorBase;
  festival: FestivalBase;
  ticket: TicketBase;
}): Promise<CreateEmailOptions> {
  const { visitor, festival, ticket } = input;
  const qrBuffer = await generateQrBuffer(
    getTicketCode(festival.festivalCode || "", ticket.ticketNumber || 0),
  );

  return {
    from: "Equipo Glitter <entradas@productoraglitter.com>",
    to: [visitor.email],
    subject: `Ya tenés tu entrada para ingresar al festival ${festival.name}`,
    react: TicketEmailTemplate({
      visitor,
      festival,
      ticket,
    }) as React.ReactElement,
    attachments: [
      {
        filename: "qrcode.png",
        content: qrBuffer,
        // Resolves the template's `cid:ticket-qrcode` image.
        contentId: "ticket-qrcode",
      },
    ],
  };
}
