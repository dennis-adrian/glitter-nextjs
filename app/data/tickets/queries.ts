import "server-only";

import { and, count, desc, eq } from "drizzle-orm";

import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { tickets } from "@/db/schema";

/**
 * Reads for the staff check-in screens. They return visitors' personal data,
 * so they live outside the server-action module, where any browser could
 * call them, and still check the caller is staff.
 */

/** The latest check-ins, with the name each ticket was issued to. */
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
