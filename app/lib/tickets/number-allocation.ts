import { eq, max, sql } from "drizzle-orm";

import { db } from "@/db";
import { tickets } from "@/db/schema";

type TicketNumberTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

const TICKET_NUMBER_LOCK_NAMESPACE = 771204;

export async function lockFestivalTicketAllocation(
  tx: TicketNumberTransaction,
  festivalId: number,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${TICKET_NUMBER_LOCK_NAMESPACE}::integer, ${festivalId}::integer)`,
  );
}

export async function allocateFestivalTicketNumber(
  tx: TicketNumberTransaction,
  festivalId: number,
): Promise<number> {
  await lockFestivalTicketAllocation(tx, festivalId);

  const [row] = await tx
    .select({ ticketNumber: max(tickets.ticketNumber) })
    .from(tickets)
    .where(eq(tickets.festivalId, festivalId));

  return (row?.ticketNumber ?? 0) + 1;
}
