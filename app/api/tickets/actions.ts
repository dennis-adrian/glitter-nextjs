"use server";

import { FestivalBase } from "@/app/api/festivals/definitions";
import { NewVisitor } from "@/app/api/visitors/actions";
import { pool, db } from "@/db";
import { tickets, visitors } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

export async function createTicketsForVisitor(
  data: NewVisitor & {
    attendance: "day_one" | "day_two" | "both";
    festival: FestivalBase;
    visitorId?: number;
  },
) {
  const client = await pool.connect();
  try {
    return await db.transaction(async (tx) => {
      const res = await tx
        .insert(visitors)
        .values({
          id: data.visitorId,
          birthdate: data.birthdate,
          email: data.email,
          firstName: data.firstName,
          gender: data.gender,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber,
          eventDiscovery: data.eventDiscovery,
        })
        .returning({ visitorId: visitors.id })
        .onConflictDoUpdate({
          target: visitors.id,
          set: {
            birthdate: data.birthdate,
            email: data.email,
            firstName: data.firstName,
            gender: data.gender,
            lastName: data.lastName,
            eventDiscovery: data.eventDiscovery,
            phoneNumber: data.phoneNumber,
          },
        });

      const visitorId = res[0].visitorId;

      const firstDayTicket = await tx.query.tickets.findFirst({
        where: and(
          eq(tickets.visitorId, visitorId),
          eq(tickets.festivalId, data.festival.id),
          eq(tickets.date, data.festival.startDate),
        ),
      });

      const secondDayTicket = await tx.query.tickets.findFirst({
        where: and(
          eq(tickets.visitorId, visitorId),
          eq(tickets.festivalId, data.festival.id),
          eq(tickets.date, data.festival.endDate),
        ),
      });

      if (data.attendance === "day_one" && !firstDayTicket) {
        await tx.insert(tickets).values({
          date: new Date(data.festival.startDate),
          festivalId: data.festival.id,
          visitorId,
        });
      } else if (data.attendance === "day_two" && !secondDayTicket) {
        await tx.insert(tickets).values({
          date: new Date(data.festival.endDate),
          festivalId: data.festival.id,
          visitorId,
        });
      } else {
        await tx
          .insert(tickets)
          .values({
            id: firstDayTicket?.id,
            date: new Date(data.festival.startDate),
            festivalId: data.festival.id,
            visitorId,
          })
          .onConflictDoNothing();
        await tx
          .insert(tickets)
          .values({
            id: secondDayTicket?.id,
            date: new Date(data.festival.endDate),
            festivalId: data.festival.id,
            visitorId,
          })
          .onConflictDoNothing();
      }
    });
  } catch (error) {
    console.error("Error creating ticket", error);
    return null;
  } finally {
    client.release();
  }
}
