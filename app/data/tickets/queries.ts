import "server-only";

import { and, count, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { tickets } from "@/db/schema";

/**
 * Reads for the staff check-in screens. They return visitors' personal data,
 * so they live outside the server-action module, where any browser could
 * call them.
 */

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
