import "server-only";

import { and, count, eq, inArray, sum } from "drizzle-orm";

import { db } from "@/db";
import { festivalActivities, standReservations, tickets } from "@/db/schema";

export type FestivalOverviewCounts = {
  /** Tickets issued, and the people they admit (a ticket can cover several). */
  tickets: number;
  ticketHolders: number;
  /** Reservations that hold a space: pending, awaiting payment check, or accepted. */
  reservations: number;
  /** Reservations waiting for an admin to check the payment. */
  reservationsToVerify: number;
  activities: number;
};

/** The few numbers the festival page shows next to each section. */
export async function fetchFestivalOverviewCounts(
  festivalId: number,
): Promise<FestivalOverviewCounts> {
  const [[ticketRow], reservationRows, [activityRow]] = await Promise.all([
    db
      .select({
        tickets: count(),
        holders: sum(tickets.numberOfVisitors),
      })
      .from(tickets)
      .where(eq(tickets.festivalId, festivalId)),
    db
      .select({ status: standReservations.status, value: count() })
      .from(standReservations)
      .where(
        and(
          eq(standReservations.festivalId, festivalId),
          inArray(standReservations.status, [
            "pending",
            "verification_payment",
            "accepted",
          ]),
        ),
      )
      .groupBy(standReservations.status),
    db
      .select({ value: count() })
      .from(festivalActivities)
      .where(eq(festivalActivities.festivalId, festivalId)),
  ]);

  return {
    tickets: ticketRow?.tickets ?? 0,
    ticketHolders: Number(ticketRow?.holders ?? 0),
    reservations: reservationRows.reduce((total, row) => total + row.value, 0),
    reservationsToVerify:
      reservationRows.find((row) => row.status === "verification_payment")
        ?.value ?? 0,
    activities: activityRow?.value ?? 0,
  };
}
