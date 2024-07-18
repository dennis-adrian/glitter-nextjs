"use server";

import { and, eq, sql } from "drizzle-orm";
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
import { formatDate } from "@/app/lib/formatters";

export type TicketBase = typeof tickets.$inferSelect;
export type TicketWithVisitor = TicketBase & { visitor: VisitorBase };
export async function createTickets(data: {
  attendance: "day_one" | "day_two" | "both";
  visitorId: number;
  festivalId: number;
  festivalStartDate: Date;
  festivalEndDate: Date;
}): Promise<{ success: boolean; error: string | null }> {
  const client = await pool.connect();
  try {
    const {
      attendance,
      festivalId,
      festivalStartDate,
      festivalEndDate,
      visitorId,
    } = data;
    await db.transaction(async (tx) => {
      const firstDayTicket = await tx.query.tickets.findFirst({
        where: and(
          eq(tickets.visitorId, visitorId),
          eq(tickets.festivalId, festivalId),
          eq(tickets.date, festivalStartDate),
        ),
      });

      const secondDayTicket = await tx.query.tickets.findFirst({
        where: and(
          eq(tickets.visitorId, visitorId),
          eq(tickets.festivalId, festivalId),
          eq(tickets.date, festivalEndDate),
        ),
      });

      const qrcode = await generateQRCode(
        `${process.env.NEXT_PUBLIC_BASE_URL}/visitors/${visitorId}/tickets`,
      );

      let qrcodeUrl = "";
      if (!(firstDayTicket || secondDayTicket || qrcode.error)) {
        qrcodeUrl = await uploadQrCode(qrcode.qrCodeUrl);
      } else {
        const qrcodeUrls = [firstDayTicket, secondDayTicket]
          .map((ticket) => ticket?.qrcodeUrl)
          .filter(Boolean);
        qrcodeUrl = qrcodeUrls[0] as string;
      }

      if (attendance === "day_one" && !firstDayTicket) {
        await tx.insert(tickets).values({
          date: new Date(festivalStartDate),
          qrcode: qrcode.qrCodeUrl,
          qrcodeUrl,
          festivalId: festivalId,
          visitorId,
        });
      } else if (attendance === "day_two" && !secondDayTicket) {
        await tx.insert(tickets).values({
          date: new Date(festivalEndDate),
          qrcode: qrcode.qrCodeUrl,
          qrcodeUrl,
          festivalId: festivalId,
          visitorId,
        });
      } else {
        await tx
          .insert(tickets)
          .values({
            id: firstDayTicket?.id,
            date: new Date(festivalStartDate),
            qrcode: qrcode.qrCodeUrl,
            qrcodeUrl,
            festivalId: festivalId,
            visitorId,
          })
          .onConflictDoNothing();
        await tx
          .insert(tickets)
          .values({
            id: secondDayTicket?.id,
            date: new Date(festivalEndDate),
            qrcode: qrcode.qrCodeUrl,
            qrcodeUrl,
            festivalId: festivalId,
            visitorId,
          })
          .onConflictDoNothing();
      }
    });
  } catch (error) {
    console.error("Error creating ticket", error);
    return { success: false, error: "No se pudo crear la(s) entrada(s)" };
  } finally {
    client.release();
  }

  revalidatePath("/festivals");
  return { success: true, error: null };
}

export async function createEventDayTicket(data: {
  visitorId: number;
  festival: FestivalWithDates;
}): Promise<{ success: boolean; message: string }> {
  const client = await pool.connect();

  try {
    const { visitorId, festival } = data;

    if (!festival.eventDayRegistration) {
      return {
        success: false,
        message: "La creación de entradas para este evento no está habilitada",
      };
    }

    await db.insert(tickets).values({
      visitorId,
      festivalId: festival.id,
      date: sql`NOW()`,
      isEventDayCreation: true,
      status: "checked_in",
    });
  } catch (error) {
    console.error("Error creating event day ticket", error);
    return { success: false, message: "No se pudo crear la entrada" };
  } finally {
    client.release();
  }

  revalidatePath("/festivals");
  return { success: true, message: "Entrada creada" };
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

export async function sendTicketEmail(
  visitor: VisitorWithTickets,
  festival: FestivalBase,
) {
  const client = await pool.connect();
  try {
    const { error, data } = await sendEmail({
      from: "Equipo Glitter <entradas@productoraglitter.com>",
      to: [visitor.email],
      subject: "Confirmación de Registro para Glitter Vol 2",
      react: TicketEmailTemplate({
        visitor,
        festival,
      }) as React.ReactElement,
    });

    if (error) throw new Error(error.message);

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
