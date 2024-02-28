"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { FestivalBase } from "@/app/api/festivals/definitions";
import { uploadQrCode } from "@/app/data/tickets/helpers";
import { generateQRCode } from "@/app/lib/utils";
import { db, pool } from "@/db";
import { tickets } from "@/db/schema";

export type TicketBase = typeof tickets.$inferSelect;
export async function createTickets(data: {
  attendance: "day_one" | "day_two" | "both";
  festival: FestivalBase;
  visitorId: number;
}): Promise<{ success: boolean; error: string | null }> {
  const client = await pool.connect();
  try {
    const { attendance, festival, visitorId } = data;
    await db.transaction(async (tx) => {
      const firstDayTicket = await tx.query.tickets.findFirst({
        where: and(
          eq(tickets.visitorId, visitorId),
          eq(tickets.festivalId, festival.id),
          eq(tickets.date, festival.startDate),
        ),
      });

      const secondDayTicket = await tx.query.tickets.findFirst({
        where: and(
          eq(tickets.visitorId, visitorId),
          eq(tickets.festivalId, festival.id),
          eq(tickets.date, festival.endDate),
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
          date: new Date(festival.startDate),
          qrcode: qrcode.qrCodeUrl,
          qrcodeUrl,
          festivalId: festival.id,
          visitorId,
        });
      } else if (attendance === "day_two" && !secondDayTicket) {
        await tx.insert(tickets).values({
          date: new Date(festival.endDate),
          qrcode: qrcode.qrCodeUrl,
          qrcodeUrl,
          festivalId: festival.id,
          visitorId,
        });
      } else {
        await tx
          .insert(tickets)
          .values({
            id: firstDayTicket?.id,
            date: new Date(festival.startDate),
            qrcode: qrcode.qrCodeUrl,
            qrcodeUrl,
            festivalId: festival.id,
            visitorId,
          })
          .onConflictDoNothing();
        await tx
          .insert(tickets)
          .values({
            id: secondDayTicket?.id,
            date: new Date(festival.endDate),
            qrcode: qrcode.qrCodeUrl,
            qrcodeUrl,
            festivalId: festival.id,
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

  revalidatePath("/festivals/[id]/registration");
  return { success: true, error: null };
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
