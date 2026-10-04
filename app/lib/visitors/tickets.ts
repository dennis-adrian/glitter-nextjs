import "server-only";

import { and, eq, max, sql } from "drizzle-orm";

import TicketEmailTemplate from "@/app/emails/ticket";
import TicketHistoryLinkEmailTemplate from "@/app/emails/ticket-history-link";
import type { FestivalBase } from "@/app/lib/festivals/definitions";
import { ticketHolderIs } from "@/app/lib/visitors/registration-data";
import { getTicketCode } from "@/app/lib/tickets/utils";
import { generateQrBuffer } from "@/app/lib/utils";
import { ticketHistoryToken } from "@/app/lib/visitors/session";
import { sendEmail } from "@/app/vendors/resend";
import { db } from "@/db";
import { tickets, visitors } from "@/db/schema";

/**
 * First key of the advisory lock that serializes ticket numbering, so a
 * festival id here cannot collide with the same number used as a lock key
 * elsewhere. Arbitrary, and only has to stay stable.
 */
const TICKET_NUMBER_LOCK_NAMESPACE = 4711;

const TICKETS_FROM = "Equipo Glitter <entradas@productoraglitter.com>";

type IssueTicketResult =
  | { status: "issued"; ticket: typeof tickets.$inferSelect }
  | { status: "exists" };

/**
 * Gives a visitor their ticket for one festival day, numbered after the
 * festival's highest. A visitor holds at most one ticket per day.
 */
export async function issueTicket(input: {
  visitorId: number;
  festivalId: number;
  date: Date;
  numberOfVisitors: number;
  /** Issued through the door form on the day, rather than ahead of time. */
  isEventDayCreation: boolean;
}): Promise<IssueTicketResult> {
  return await db.transaction(async (tx) => {
    /**
     * Serializes registration for this festival, and is taken before
     * anything is read so that both reads below see every committed ticket.
     *
     * Row locks cannot do this job: `SELECT ... FOR UPDATE` only locks rows
     * that already exist, so two registrations arriving together read the
     * same highest number, and each inserts a row the other never saw —
     * duplicate numbers, and a second ticket for a visitor who already had
     * one. Nothing in the schema catches either afterwards.
     */
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${TICKET_NUMBER_LOCK_NAMESPACE}, ${input.festivalId})`,
    );

    const [existing] = await tx
      .select({ id: tickets.id })
      .from(tickets)
      .where(
        and(
          ticketHolderIs(input.visitorId),
          eq(tickets.festivalId, input.festivalId),
          eq(tickets.date, input.date),
        ),
      )
      .limit(1);
    if (existing) return { status: "exists" } as const;

    const [{ highest }] = await tx
      .select({ highest: max(tickets.ticketNumber) })
      .from(tickets)
      .where(eq(tickets.festivalId, input.festivalId));

    const [ticket] = await tx
      .insert(tickets)
      .values({
        date: input.date,
        visitorId: input.visitorId,
        festivalId: input.festivalId,
        ticketNumber: (highest ?? 0) + 1,
        numberOfVisitors: input.numberOfVisitors,
        isEventDayCreation: input.isEventDayCreation,
      })
      .returning();

    return { status: "issued", ticket } as const;
  });
}

function ticketHistoryUrl(visitorId: number) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const token = encodeURIComponent(ticketHistoryToken(visitorId));
  return `${baseUrl}/visitors/tickets/access?token=${token}`;
}

/**
 * Mails a newly issued ticket to the address on the visitor's record — never
 * to one the browser supplied — with its QR and a link to all their tickets.
 */
export async function sendTicketIssuedEmail(
  ticket: typeof tickets.$inferSelect,
  festival: FestivalBase,
) {
  try {
    const visitor = await db.query.visitors.findFirst({
      where: eq(visitors.id, ticket.visitorId),
    });
    if (!visitor) return;

    const qrBuffer = await generateQrBuffer(
      getTicketCode(festival.festivalCode || "", ticket.ticketNumber || 0),
    );

    // `content_id` is what the email's `cid:` image points at. The SDK passes
    // attachments through untouched but does not type that field.
    const qrAttachment = {
      filename: "qrcode.png",
      content: qrBuffer,
      content_id: "ticket-qrcode",
    };

    const { error } = await sendEmail({
      from: TICKETS_FROM,
      to: [visitor.email],
      subject: `Ya tienes tu entrada para ingresar al festival ${festival.name}`,
      react: TicketEmailTemplate({
        visitor,
        festival,
        ticket,
        ticketsUrl: ticketHistoryUrl(visitor.id),
      }) as React.ReactElement,
      attachments: [qrAttachment],
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("Error sending ticket email", { ticketId: ticket.id, error });
  }
}

/** Mails a visitor the link that opens the history of all their tickets. */
export async function sendTicketHistoryLinkEmail(visitorId: number) {
  try {
    const visitor = await db.query.visitors.findFirst({
      columns: { id: true, email: true, firstName: true },
      where: eq(visitors.id, visitorId),
    });
    if (!visitor) return;

    const { error } = await sendEmail({
      from: TICKETS_FROM,
      to: [visitor.email],
      subject: "Tus entradas de Productora Glitter",
      react: TicketHistoryLinkEmailTemplate({
        firstName: visitor.firstName,
        ticketsUrl: ticketHistoryUrl(visitor.id),
      }) as React.ReactElement,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("Error sending ticket history link", { visitorId, error });
  }
}
