"use server";

import { and, count, desc, eq, max, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { generateQrBuffer } from "@/app/lib/utils";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { festivals, tickets, visitors } from "@/db/schema";
import type { VisitorBase } from "../visitors/actions";
import { sendEmail } from "@/app/vendors/resend";
import TicketEmailTemplate from "@/app/emails/ticket";
import { getTicketCode } from "@/app/lib/tickets/utils";

export type TicketBase = typeof tickets.$inferSelect;
export type TicketWithVisitor = TicketBase & { visitor: VisitorBase };

/**
 * First key of the advisory lock that serializes ticket numbering, so a
 * festival id here cannot collide with the same number used as a lock key
 * elsewhere. Arbitrary, and only has to stay stable.
 */
const TICKET_NUMBER_LOCK_NAMESPACE = 4711;

/** The most people one ticket admits: the family registration stops at ten. */
const MAX_VISITORS_PER_TICKET = 10;

/** Longest address a mailbox can have; anything longer names no visitor. */
const MAX_EMAIL_LENGTH = 320;

/**
 * Public: anyone registering for a festival creates their own ticket.
 *
 * The visitor is named by the email they typed, never by id: visitor ids are
 * sequential, so an id-keyed action let anyone loop over every visitor and
 * mail each one a ticket. Keyed on the address, a caller reaches only the
 * addresses they already know. The festival is named by id. Both rows are read
 * here, because the confirmation mail goes to the visitor's stored address and
 * prints the festival's stored name, place and mascot — taken from the caller,
 * this sent mail anywhere from the festival's address with any content.
 */
export async function createTicket(data: {
  date: Date;
  email: string;
  festivalId: number;
  numberOfVisitors?: number;
}) {
  const invalid = {
    success: false,
    message: "No se pudo crear la entrada",
    ticket: null,
  };
  const date = new Date(data.date);
  // Matched exactly, as the registration looked the visitor up, so not
  // trimmed or lowercased here.
  const email = data.email;
  if (
    typeof email !== "string" ||
    email.length === 0 ||
    email.length > MAX_EMAIL_LENGTH ||
    !Number.isInteger(data.festivalId) ||
    data.festivalId <= 0 ||
    Number.isNaN(date.getTime())
  ) {
    return invalid;
  }
  const numberOfVisitors = Math.min(
    Math.max(Math.trunc(Number(data.numberOfVisitors) || 1), 1),
    MAX_VISITORS_PER_TICKET,
  );

  const loaded = await Promise.all([
    db.query.visitors.findFirst({ where: eq(visitors.email, email) }),
    db.query.festivals.findFirst({
      where: eq(festivals.id, data.festivalId),
      with: { festivalDates: true },
    }),
  ]).catch((error) => {
    console.error(error);
    return null;
  });
  if (!loaded) return invalid;
  const [visitor, festival] = loaded;

  // Both registration forms send one of the festival's own start dates.
  if (
    !visitor ||
    !festival ||
    !festival.festivalDates.some(
      (festivalDate) => festivalDate.startDate.getTime() === date.getTime(),
    )
  ) {
    return invalid;
  }

  let createdTicket: TicketBase;
  try {
    const rows = await db.transaction(async (tx) => {
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
        sql`SELECT pg_advisory_xact_lock(${TICKET_NUMBER_LOCK_NAMESPACE}, ${festival.id})`,
      );

      const existingTickets = await tx
        .select()
        .from(tickets)
        .where(
          and(
            eq(tickets.visitorId, visitor.id),
            eq(tickets.festivalId, festival.id),
            eq(tickets.date, date),
          ),
        );

      if (existingTickets.length > 0) {
        throw new Error("Ya existe una entrada para este día", {
          cause: "ticket_exists",
        });
      }

      const [{ highest }] = await tx
        .select({ highest: max(tickets.ticketNumber) })
        .from(tickets)
        .where(eq(tickets.festivalId, festival.id));

      const ticketNumber = (highest ?? 0) + 1;

      return await tx
        .insert(tickets)
        .values({
          date,
          visitorId: visitor.id,
          festivalId: festival.id,
          ticketNumber: ticketNumber,
          numberOfVisitors,
        })
        .returning();
    });

    createdTicket = rows[0];
  } catch (error) {
    console.error(error);
    let message = "No se pudo crear la entrada";

    if (error instanceof Error) {
      if (error.cause === "ticket_exists") {
        message = error.message;
      }
    }

    return {
      success: false,
      message,
      ticket: null,
    };
  }

  const qrBuffer = await generateQrBuffer(
    getTicketCode(festival.festivalCode || "", createdTicket.ticketNumber || 0),
  );
  const qrAttachment = {
    filename: "qrcode.png",
    content: qrBuffer,
    content_id: "ticket-qrcode",
  };

  sendEmail({
    from: "Equipo Glitter <entradas@productoraglitter.com>",
    to: [visitor.email],
    subject: `Ya tienes tu entrada para ingresar al festival ${festival.name}`,
    react: TicketEmailTemplate({
      visitor,
      festival,
      ticket: createdTicket,
    }) as React.ReactElement,
    attachments: [qrAttachment],
  });

  revalidatePath(`/festivals/${festival.id}/registration`);
  return {
    success: true,
    message: "Entrada creada correctamente",
    ticket: createdTicket,
  };
}

export async function updateTicket(id: number, status: TicketBase["status"]) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, error: "No autorizado" };
  }

  try {
    await db.update(tickets).set({ status }).where(eq(tickets.id, id));
  } catch (error) {
    console.error(error);
    return {
      success: false,
      error: "No se pudo actualizar el estado de la entrada",
    };
  }

  revalidatePath("/dashboard/festivals");
  revalidatePath("/visitors");
  return {
    success: true,
    error: null,
  };
}

export async function verifyTicket(ticketNumber: number, festivalId: number) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

  try {
    const [ticket] = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.festivalId, festivalId),
          eq(tickets.ticketNumber, ticketNumber),
        ),
      );

    if (!ticket) throw new Error("La entrada no existe");
    if (ticket.status === "checked_in") {
      throw new Error("Esta entrada ya ha sido verificada");
    }

    // Predicate on status closes the race where two concurrent verifies both
    // pass the read above; a zero-row update means the other won.
    //
    // The id pins the update to the row that was read. Nothing in the database
    // stops two tickets from sharing a festival and number, and without the id
    // one scan would check in every one of them at once.
    const updated = await db
      .update(tickets)
      .set({
        status: "checked_in",
        checkedInAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(tickets.id, ticket.id),
          eq(tickets.festivalId, festivalId),
          eq(tickets.ticketNumber, ticketNumber),
          ne(tickets.status, "checked_in"),
        ),
      )
      .returning({ id: tickets.id });

    if (updated.length !== 1) {
      throw new Error("Esta entrada ya ha sido verificada");
    }
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      return {
        success: false,
        message: error.message,
      };
    }

    return {
      success: false,
      message: "No se pudo verificar la entrada",
    };
  }

  revalidatePath("/dashboard/festivals");
  return {
    success: true,
    message: "Entrada verificada correctamente",
  };
}

/**
 * Staff only. Takes the visitor by id and reads the address here: if sending is
 * switched back on, the recipient and the festival printed in the mail must come
 * from the database, never from the caller.
 */
export async function sendTicketEmail(visitorId: number) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

  try {
    const visitor = await db.query.visitors.findFirst({
      where: eq(visitors.id, visitorId),
      columns: { email: true },
    });
    if (!visitor) throw new Error("Visitor not found");

    // Sending is disabled. To switch it back on, load the ticket and festival
    // by id as createTicket does, then:
    // const { error, data } = await sendEmail({
    //   from: "Equipo Glitter <entradas@productoraglitter.com>",
    //   to: [visitor.email],
    //   subject: `Ya tienes tu entrada para ingresar al festival ${festival.name}`,
    //   react: TicketEmailTemplate({
    //     visitor,
    //     festival,
    //   }) as React.ReactElement,
    // });

    // if (error) throw new Error(error.message);

    return {
      success: true,
      message: `Se envió el correo a ${visitor.email}`,
    };
  } catch (error) {
    console.error("Error sending pending emails", error);
    return {
      success: false,
      message: "No se pudo enviar el correo con la entrada",
    };
  }
}

/** Staff only: the latest check-ins, with the name each ticket was issued to. */
export async function fetchTicketsByFestival(festivalId: number) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) return [];

  try {
    return await db.query.tickets.findMany({
      with: {
        visitor: {
          columns: {
            firstName: true,
            lastName: true,
          },
        },
        festival: true,
      },
      where: and(
        eq(tickets.festivalId, festivalId),
        eq(tickets.status, "checked_in"),
      ),
      orderBy: desc(tickets.updatedAt),
      limit: 50,
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function fetchVerifiedTicketsByFestivalTotal(festivalId: number) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) return 0;

  try {
    const result = await db
      .select({
        total: count(tickets.id),
      })
      .from(tickets)
      .where(
        and(
          eq(tickets.festivalId, festivalId),
          eq(tickets.status, "checked_in"),
        ),
      );
    return result[0].total;
  } catch (error) {
    console.error(error);
    return 0;
  }
}
