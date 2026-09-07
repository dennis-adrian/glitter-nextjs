import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  sessionPurchaseEvents,
  sessionPurchases,
  sessionTickets,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | DbTx;

/**
 * Placeholder identity for a deleted buyer.
 *
 * `.invalid` is reserved by RFC 2606 and can never resolve, so a scrubbed
 * address cannot accidentally reach a real inbox. The row id is folded in
 * because `session_tickets` carries a partial unique index on
 * `(occurrenceId, lower(attendeeEmail))` — a shared placeholder would collide
 * as soon as two deleted people had held seats in the same occurrence.
 */
const ANONYMOUS_NAME = "Perfil eliminado";
const anonymousEmail = (rowId: number) =>
  `eliminado+${rowId}@perfil-eliminado.invalid`;
const ANONYMOUS_PHONE = "—";

/**
 * Strips personal data from a departing user's purchases while keeping the
 * rows, so seat counts, attendance, and audit history stay intact.
 *
 * Must run before `DELETE FROM users`. `sessionPurchases.userId` is
 * `ON DELETE RESTRICT` precisely so that forgetting this step fails loudly
 * instead of silently orphaning financial history — and the identity check
 * would reject a row left with neither a user nor guest details.
 *
 * Mirrors `scrubDisciplinaryNotificationJobsForUser`, which scrubs outbox PII
 * on the same path.
 */
export async function anonymizeProgramPurchasesForUser(
  executor: Executor,
  userId: number,
  now = new Date(),
): Promise<{ purchases: number; tickets: number }> {
  const owned = await executor
    .select({ id: sessionPurchases.id })
    .from(sessionPurchases)
    .where(eq(sessionPurchases.userId, userId));

  /**
   * Queried independently of `owned`, not nested behind it: being an attendee
   * and being the buyer are separate relationships. Someone can hold a ticket
   * another person bought, and `sessionTickets.attendeeUserId` is
   * `ON DELETE SET NULL` — so the user row would delete cleanly and leave that
   * attendee's name and email behind forever.
   */
  const tickets = await executor
    .select({ id: sessionTickets.id })
    .from(sessionTickets)
    .where(eq(sessionTickets.attendeeUserId, userId));

  if (owned.length === 0 && tickets.length === 0) {
    return { purchases: 0, tickets: 0 };
  }

  for (const ticket of tickets) {
    await executor
      .update(sessionTickets)
      .set({
        attendeeUserId: null,
        attendeeName: ANONYMOUS_NAME,
        attendeeEmail: anonymousEmail(ticket.id),
        updatedAt: now,
      })
      .where(eq(sessionTickets.id, ticket.id));
  }

  for (const purchase of owned) {
    await executor
      .update(sessionPurchases)
      .set({
        userId: null,
        guestName: ANONYMOUS_NAME,
        guestEmail: anonymousEmail(purchase.id),
        guestPhone: ANONYMOUS_PHONE,
        // Demographics are personal data too, and unlike the identity fields
        // they are nullable — so they can be dropped outright rather than
        // replaced with a placeholder.
        guestGender: null,
        guestBirthdate: null,
        // The person is gone; their recovery link must stop working.
        accessTokenRevokedAt: now,
        updatedAt: now,
      })
      .where(eq(sessionPurchases.id, purchase.id));

    await executor.insert(sessionPurchaseEvents).values({
      purchaseId: purchase.id,
      actorType: "system",
      eventType: "adjusted",
      reason: "Perfil eliminado: datos personales anonimizados",
      changes: { anonymizedAt: now.toISOString() },
    });
  }

  return { purchases: owned.length, tickets: tickets.length };
}
