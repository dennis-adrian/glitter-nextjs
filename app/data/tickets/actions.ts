"use server";

import { and, count, desc, eq, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  FestivalBase,
  FestivalWithDates,
} from "@/app/data/festivals/definitions";
import { uploadQrCode } from "@/app/data/tickets/helpers";
import { generateQRCode } from "@/app/lib/utils";
import { db, pool } from "@/db";
import { tickets } from "@/db/schema";
import { VisitorBase, VisitorWithTickets } from "../visitors/actions";
import { sendEmail } from "@/app/vendors/resend";
import TicketEmailTemplate from "@/app/emails/ticket";
import { getTicketCode } from "@/app/lib/tickets/utils";

export type TicketBase = typeof tickets.$inferSelect;
export type TicketWithVisitor = TicketBase & { visitor: VisitorBase };
export async function createTicket(data: {
  date: Date;
  visitor: VisitorBase;
  festival: FestivalBase;
  numberOfVisitors?: number;
}) {
  const { date, visitor, festival } = data;

  let createdTicket: TicketBase;
  try {
    const rows = await db.transaction(async (tx) => {
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

      const rowsToLock = await tx
        .select()
        .from(tickets)
        .where(eq(tickets.festivalId, festival.id))
        .for("update");

      const maxTicketNumber =
        rowsToLock.length > 0
          ? Math.max(...rowsToLock.map((row) => row.ticketNumber ?? 0))
          : 0;
      const ticketNumber = maxTicketNumber + 1;

      const qrcode = await generateQRCode(
        getTicketCode(festival.festivalCode || "", ticketNumber),
      );
      const qrcodeUrl = await uploadQrCode(qrcode.qrCodeUrl);

      return await tx
        .insert(tickets)
        .values({
          date,
          visitorId: visitor.id,
          festivalId: festival.id,
          ticketNumber: ticketNumber,
          qrcode: qrcode.qrCodeUrl,
          qrcodeUrl: qrcodeUrl,
          numberOfVisitors: data.numberOfVisitors || 1,
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

  sendEmail({
    from: "Equipo Glitter <entradas@productoraglitter.com>",
    to: [visitor.email],
    subject: `Ya tienes tu entrada para ingresar al festival ${festival.name}`,
    react: TicketEmailTemplate({
      visitor,
      festival,
      ticket: createdTicket,
    }) as React.ReactElement,
  });

  return {
    success: true,
    message: "Entrada creada correctamente",
    ticket: createdTicket,
  };
}

export async function fetchTicket(
  id: number,
): Promise<TicketBase | undefined | null> {
  const client = await pool.connect();
  try {
    return await db.query.tickets.findFirst({
      where: eq(tickets.id, id),
    });
  } catch (error) {
    console.error(error);
    return null;
  } finally {
    client.release();
  }
}

export async function updateTicket(id: number, status: TicketBase["status"]) {
  const client = await pool.connect();
  try {
    await db.update(tickets).set({ status }).where(eq(tickets.id, id));
  } catch (error) {
    console.error(error);
    return {
      success: false,
      error: "No se pudo actualizar el estado de la entrada",
    };
  } finally {
    client.release();
  }

  revalidatePath("/dashboard/festivals");
  revalidatePath("/visitors");
  return {
    success: true,
    error: null,
  };
}

export async function verifyTicket(ticketNumber: number, festivalId: number) {
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

    await db
      .update(tickets)
      .set({
        status: "checked_in",
        checkedInAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(tickets.festivalId, festivalId),
          eq(tickets.ticketNumber, ticketNumber),
        ),
      );
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

export async function sendTicketEmail(
  visitor: VisitorWithTickets,
  festival: FestivalBase,
) {
  const client = await pool.connect();
  try {
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
  } finally {
    client.release();
  }
}

export async function fetchTicketsByFestival(festivalId: number) {
  try {
    return await db.query.tickets.findMany({
      with: {
        visitor: true,
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
