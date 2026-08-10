import "server-only";

import { and, asc, eq, gte, inArray, isNotNull, lt, lte } from "drizzle-orm";

import { queueEmails } from "@/app/lib/emails/helpers";
import { sendSessionDayReminderEmail } from "@/app/lib/programs/notifications";
import {
  buildSessionDayReminderKey,
  groupSessionDayReminders,
  resolveStoreDayWindow,
  type ReminderTicket,
  type SessionDayReminder,
} from "@/app/lib/programs/reminders";
import { utcTimestamp } from "@/app/lib/sql-time";
import { db } from "@/db";
import {
  programSessions,
  programs,
  sessionOccurrences,
  sessionPurchaseEvents,
  sessionPurchases,
  sessionTickets,
  sessionWaitlistEntries,
  sessionWaitlistInvitations,
  venues,
} from "@/db/schema";

export type ExpiredHoldSweepResult = {
  expired: number;
  purchaseIds: number[];
};

/**
 * Flips abandoned bank-QR holds to `expired`.
 *
 * This does **not** free seats — `isHoldingSeat` already stops counting a
 * `pending_upload` the instant its deadline passes, so inventory is correct
 * whether or not this ever runs. What the sweep adds is bookkeeping: a
 * terminal status, an `expiredAt`, and an audit row, so an abandoned purchase
 * stops appearing live in admin views and reporting.
 *
 * Only `pending_upload` is swept. Once a voucher exists the purchase is
 * `under_verification` and the seat is held by the review, not the clock —
 * expiring it would silently discard a payment the team has not looked at.
 *
 * The UPDATE is the claim: overlapping runs cannot both process a row, because
 * only one of them gets it back from `RETURNING`. It shares a transaction with
 * the audit insert so a purchase can never end up `expired` with no record of
 * why — either both land or neither does.
 */
export async function expireAbandonedHolds(
  now = new Date(),
): Promise<ExpiredHoldSweepResult> {
  const purchaseIds = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(sessionPurchases)
      .set({ status: "expired", expiredAt: now, updatedAt: now })
      .where(
        and(
          eq(sessionPurchases.status, "pending_upload"),
          eq(sessionPurchases.paymentMode, "bank_qr"),
          isNotNull(sessionPurchases.holdExpiresAt),
          // Explicit UTC. Drizzle's own column mapping already encodes a bare
          // `Date` correctly here, but the wrapper keeps the intent legible
          // next to the raw-SQL availability predicates, where a bare `Date`
          // *is* silently local-zone and once miscounted holds.
          lte(sessionPurchases.holdExpiresAt, utcTimestamp(now)),
        ),
      )
      .returning({ id: sessionPurchases.id });

    if (claimed.length === 0) return [];

    const ids = claimed.map((row) => row.id);

    await tx.insert(sessionPurchaseEvents).values(
      ids.map((purchaseId) => ({
        purchaseId,
        actorType: "system" as const,
        eventType: "expired" as const,
        fromStatus: "pending_upload" as const,
        toStatus: "expired" as const,
        changes: { sweptAt: now.toISOString() },
      })),
    );

    return ids;
  });

  return { expired: purchaseIds.length, purchaseIds };
}

export type ExpiredInvitationSweepResult = {
  expired: number;
  invitationIds: number[];
};

/**
 * Flips lapsed waitlist invitations to `expired`.
 *
 * Like the hold sweep, this changes nothing about who may buy:
 * `resolveInvitationUse` already refuses an invitation past its deadline
 * whatever the row says. What the sweep adds is a truthful status, so the
 * partial unique index frees up and an admin can invite the same person again
 * without the row still claiming to be live.
 *
 * The entry goes back to `waiting` rather than staying `invited`: they never
 * took the seat, and leaving them `invited` would misreport the list.
 * `converted` and `removed` entries are left alone — both are terminal.
 */
export async function expireWaitlistInvitations(
  now = new Date(),
): Promise<ExpiredInvitationSweepResult> {
  const invitationIds = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(sessionWaitlistInvitations)
      .set({ status: "expired", updatedAt: now })
      .where(
        and(
          eq(sessionWaitlistInvitations.status, "sent"),
          lte(sessionWaitlistInvitations.expiresAt, utcTimestamp(now)),
        ),
      )
      .returning({
        id: sessionWaitlistInvitations.id,
        entryId: sessionWaitlistInvitations.waitlistEntryId,
      });

    if (claimed.length === 0) return [];

    await tx
      .update(sessionWaitlistEntries)
      .set({ status: "waiting", updatedAt: now })
      .where(
        and(
          inArray(
            sessionWaitlistEntries.id,
            claimed.map((row) => row.entryId),
          ),
          eq(sessionWaitlistEntries.status, "invited"),
        ),
      );

    return claimed.map((row) => row.id);
  });

  return { expired: invitationIds.length, invitationIds };
}

export type SessionDayReminderSweepResult = {
  /** Valid tickets found for today, before grouping. */
  tickets: number;
  /** People mailed — one message each, however many seats they hold. */
  recipients: number;
  sent: number;
  failed: number;
};

/**
 * Mails everyone confirmed for a session that starts today.
 *
 * "Confirmed" is `session_tickets.status = 'valid'`, the same predicate the
 * roster calls `confirmed` and the door calls admissible. Reading tickets
 * rather than purchases is what keeps this honest: an approved purchase whose
 * ticket support later cancelled no longer has a seat, and a purchase still
 * under review does not have one yet — neither person should be told to show
 * up. It also gives the sweep the attendee snapshots directly, so guests and
 * renamed profiles both reach the right inbox.
 *
 * Cancelled and completed occurrences are excluded. A cancelled session must
 * never generate a "see you today", and a `completed` one already happened.
 *
 * Nothing is written. The send is deduplicated by a per-recipient, per-day
 * idempotency key on Resend — the same mechanism the rest of this domain uses
 * (§10) — so a retried or double-fired cron costs nothing and needs no column.
 *
 * Throughput ceiling: `queueEmails` paces at ten per second and `vercel.json`
 * caps the function at 100s, so roughly two hundred recipients is the most one
 * run can clear. A day that large would need batching — a re-run does not
 * rescue it, because the idempotency key is honoured by Resend, not by us, so
 * already-mailed recipients still cost a round trip and the tail is still cut.
 */
export async function sendSessionDayReminders(
  now = new Date(),
): Promise<SessionDayReminderSweepResult> {
  const today = resolveStoreDayWindow(now);

  const rows: ReminderTicket[] = await db
    .select({
      ticketId: sessionTickets.id,
      ticketCode: sessionTickets.code,
      attendeeName: sessionTickets.attendeeName,
      attendeeEmail: sessionTickets.attendeeEmail,
      attendeeUserId: sessionTickets.attendeeUserId,
      sessionTitle: programSessions.title,
      sessionType: programSessions.type,
      programName: programs.name,
      startsAt: sessionOccurrences.startsAt,
      endsAt: sessionOccurrences.endsAt,
      venueName: venues.name,
      room: sessionOccurrences.room,
    })
    .from(sessionTickets)
    .innerJoin(
      sessionOccurrences,
      eq(sessionOccurrences.id, sessionTickets.occurrenceId),
    )
    .innerJoin(
      programSessions,
      eq(programSessions.id, sessionOccurrences.sessionId),
    )
    .innerJoin(programs, eq(programs.id, programSessions.programId))
    .leftJoin(venues, eq(venues.id, sessionOccurrences.venueId))
    .where(
      and(
        eq(sessionTickets.status, "valid"),
        eq(sessionOccurrences.lifecycleStatus, "scheduled"),
        // Half-open on the store-local day. Explicit UTC for the same reason
        // the hold sweep uses it: the columns hold UTC wall-clock, and a bare
        // `Date` would be reinterpreted in whatever zone the process runs in.
        gte(sessionOccurrences.startsAt, utcTimestamp(today.start)),
        lt(sessionOccurrences.startsAt, utcTimestamp(today.end)),
      ),
    )
    .orderBy(asc(sessionOccurrences.startsAt), asc(sessionTickets.id));

  const reminders = groupSessionDayReminders(rows);

  let sent = 0;

  await queueEmails<SessionDayReminder, undefined>(
    reminders,
    async (reminder) => {
      const delivered = await sendSessionDayReminderEmail({
        attendeeName: reminder.attendeeName,
        attendeeEmail: reminder.attendeeEmail,
        hasAccount: reminder.hasAccount,
        lines: reminder.tickets.map((ticket) => ({
          sessionTitle: ticket.sessionTitle,
          sessionType: ticket.sessionType,
          programName: ticket.programName,
          startsAt: ticket.startsAt,
          endsAt: ticket.endsAt,
          venueName: ticket.venueName,
          room: ticket.room,
          ticketCode: ticket.ticketCode,
        })),
        idempotencyKey: buildSessionDayReminderKey(
          today.dayKey,
          reminder.tickets.map((ticket) => ticket.ticketId),
        ),
      });

      if (delivered) sent += 1;
    },
  );

  return {
    tickets: rows.length,
    recipients: reminders.length,
    sent,
    failed: reminders.length - sent,
  };
}
