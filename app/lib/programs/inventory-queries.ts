import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import {
  resolveAvailability,
  type OccurrenceAvailability,
} from "@/app/lib/programs/inventory";
import { db } from "@/db";
import { sessionOccurrences, sessionTickets } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | DbTx;

/**
 * Locks the given occurrences for the rest of the transaction, in ascending id
 * order so concurrent purchases serialize instead of deadlocking.
 *
 * This is the barrier that makes availability trustworthy: every writer counts
 * seats only after holding the row lock, so two requests for the last seat are
 * forced into a queue rather than both reading "1 remaining".
 */
export async function lockOccurrences(
  tx: DbTx,
  occurrenceIds: number[],
): Promise<void> {
  if (occurrenceIds.length === 0) return;

  await tx.execute(
    sql`SELECT id FROM ${sessionOccurrences}
        WHERE ${inArray(sessionOccurrences.id, occurrenceIds)}
        ORDER BY id
        FOR UPDATE`,
  );
}

/**
 * Counts what occupies an occurrence right now: issued tickets plus lines whose
 * purchase is still holding. Mirrors `isHoldingSeat` in SQL — the two must stay
 * in step, which is why the holding predicate lives in one place here.
 */
export async function fetchOccurrenceAvailability(
  executor: Executor,
  occurrenceId: number,
  options: { now?: Date } = {},
): Promise<OccurrenceAvailability> {
  const now = options.now ?? new Date();

  const result = await executor.execute(sql`
    SELECT
      o.capacity AS capacity,
      (
        SELECT count(*) FROM session_tickets t
        WHERE t.occurrence_id = o.id AND t.status = 'valid'
      ) AS valid_tickets,
      (
        SELECT count(*)
        FROM session_purchase_lines l
        JOIN session_purchases p ON p.id = l.purchase_id
        WHERE l.occurrence_id = o.id
          AND (
            p.status IN ('under_verification', 'changes_requested')
            OR (p.status = 'pending_upload' AND p.hold_expires_at > ${now})
          )
      ) AS active_holds
    FROM session_occurrences o
    WHERE o.id = ${occurrenceId}
  `);

  const row = result.rows[0] as
    | { capacity: number; valid_tickets: string; active_holds: string }
    | undefined;

  if (!row) {
    return resolveAvailability({
      capacity: 0,
      validTickets: 0,
      activeHolds: 0,
    });
  }

  return resolveAvailability({
    capacity: Number(row.capacity),
    validTickets: Number(row.valid_tickets),
    activeHolds: Number(row.active_holds),
  });
}

/**
 * Whether this attendee already holds a valid ticket for the occurrence.
 *
 * The partial unique indexes on `session_tickets` are the real guarantee; this
 * exists so the buyer gets "you already have a ticket" instead of a constraint
 * violation.
 */
export async function hasValidTicketFor(
  executor: Executor,
  occurrenceId: number,
  attendee: { userId: number | null; email: string },
): Promise<boolean> {
  const matchesAttendee =
    attendee.userId !== null
      ? sql`(${sessionTickets.attendeeUserId} = ${attendee.userId}
             OR lower(${sessionTickets.attendeeEmail}) = lower(${attendee.email}))`
      : sql`lower(${sessionTickets.attendeeEmail}) = lower(${attendee.email})`;

  const rows = await executor
    .select({ id: sessionTickets.id })
    .from(sessionTickets)
    .where(
      and(
        eq(sessionTickets.occurrenceId, occurrenceId),
        eq(sessionTickets.status, "valid"),
        matchesAttendee,
      ),
    )
    .limit(1);

  return rows.length > 0;
}
