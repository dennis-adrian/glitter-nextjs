import "server-only";

import { and, asc, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { invoices, reservationParticipants } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Who a reservation with no recorded owner belongs to, for its payment
 * reminder: the account its first live cobro is billed to, or failing that
 * the participation made first.
 *
 * Ordered by participation row, not by user id or by whatever order a scan
 * returns: a participation transfer rewrites a row in place, which can move it
 * physically, so an unordered read could hand the reminder to a companion. The
 * admin history derives the holder the same way (`reservationHolderId`).
 *
 * A leaf module so both the repricing and the deadline extension can use it
 * without importing each other.
 */
export async function taskHolderForOwnerlessReservation(
  tx: DbTx,
  reservationId: number,
): Promise<number | null> {
  const [invoice] = await tx
    .select({ userId: invoices.userId })
    .from(invoices)
    .where(
      and(
        eq(invoices.reservationId, reservationId),
        ne(invoices.status, "cancelled"),
      ),
    )
    .orderBy(asc(invoices.id))
    .limit(1);
  if (invoice) return invoice.userId;
  const [participant] = await tx
    .select({ userId: reservationParticipants.userId })
    .from(reservationParticipants)
    .where(eq(reservationParticipants.reservationId, reservationId))
    .orderBy(asc(reservationParticipants.id))
    .limit(1);
  return participant?.userId ?? null;
}
