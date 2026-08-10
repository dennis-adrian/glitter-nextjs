import { createHash } from "crypto";

import { DateTime } from "luxon";

import { STORE_TIMEZONE } from "@/app/lib/formatters";
import type { SessionType } from "@/app/lib/programs/definitions";

/**
 * The day the reminder is about, as a *local* day.
 *
 * "Is the session today" is a question about Bolivia, not about UTC. A run at
 * 10:00 in La Paz is 14:00 UTC, so a UTC-day window would already have dropped
 * everything between midnight and 04:00 local — and, worse, would silently
 * include the small hours of tomorrow. The window is therefore built in
 * `STORE_TIMEZONE` and only then converted to instants.
 *
 * Half-open by construction: `start` is inclusive, `end` exclusive, so a
 * session starting exactly at midnight belongs to one day and never to two.
 */
export type StoreDayWindow = {
  start: Date;
  end: Date;
  /** `YYYY-MM-DD` in store time — the discriminator for the day's send. */
  dayKey: string;
};

export function resolveStoreDayWindow(now: Date): StoreDayWindow {
  const startOfDay = DateTime.fromJSDate(now, {
    zone: STORE_TIMEZONE,
  }).startOf("day");

  return {
    start: startOfDay.toJSDate(),
    end: startOfDay.plus({ days: 1 }).toJSDate(),
    // A `startOf("day")` in a real zone always has a date, so the fallback is
    // unreachable; it exists only because luxon types `toISODate` as nullable.
    dayKey: startOfDay.toISODate() ?? "unknown",
  };
}

/** One valid ticket for a session happening today, as the sweep reads it. */
export type ReminderTicket = {
  ticketId: number;
  ticketCode: string;
  /** Snapshots on the ticket, so guests and edited profiles both work. */
  attendeeName: string;
  attendeeEmail: string;
  /** Null for a guest; drives whether we can offer a "my sessions" link. */
  attendeeUserId: number | null;
  sessionTitle: string;
  sessionType: SessionType;
  programName: string;
  startsAt: Date;
  endsAt: Date;
  venueName: string | null;
  room: string | null;
};

/** Everything one person is expected at today, in one message. */
export type SessionDayReminder = {
  /** Lowercased — it is also the grouping key. */
  attendeeEmail: string;
  attendeeName: string;
  /** True when at least one of their tickets is tied to an account. */
  hasAccount: boolean;
  tickets: ReminderTicket[];
};

/**
 * `.invalid` is reserved by RFC 2606 and is what `anonymizeProgramPurchasesForUser`
 * writes over a departing attendee's address. Mailing it would be a guaranteed
 * bounce against a person who asked to be forgotten, so those tickets are
 * dropped rather than attempted.
 */
export function isDeliverableAttendeeEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();

  if (!normalized.includes("@")) return false;

  return !normalized.endsWith(".invalid");
}

/**
 * Collapses today's tickets into one message per person.
 *
 * Grouped rather than sent per ticket because the same address can hold seats
 * in two sessions on one day — a morning charla and an afternoon taller is a
 * normal festival schedule — and two "you have something today" emails an hour
 * apart read as a bug. The identity used is the ticket snapshot, so a guest and
 * a signed-in attendee group the same way.
 *
 * Case-insensitive on the address, matching the partial unique index on
 * `(occurrenceId, lower(attendeeEmail))`: the database already treats
 * `Ana@x.com` and `ana@x.com` as one person, and so must the mail.
 */
export function groupSessionDayReminders(
  tickets: ReminderTicket[],
): SessionDayReminder[] {
  const byEmail = new Map<string, SessionDayReminder>();

  for (const ticket of tickets) {
    if (!isDeliverableAttendeeEmail(ticket.attendeeEmail)) continue;

    const key = ticket.attendeeEmail.trim().toLowerCase();
    const existing = byEmail.get(key);

    if (existing) {
      existing.tickets.push(ticket);
      existing.hasAccount ||= ticket.attendeeUserId !== null;
      continue;
    }

    byEmail.set(key, {
      attendeeEmail: key,
      attendeeName: ticket.attendeeName,
      hasAccount: ticket.attendeeUserId !== null,
      tickets: [ticket],
    });
  }

  const reminders = [...byEmail.values()];

  for (const reminder of reminders) {
    // Chronological: the email is read as a plan for the day, and the first
    // line someone needs is the thing happening soonest.
    reminder.tickets.sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime() || a.ticketId - b.ticketId,
    );
  }

  // Stable order so a rerun processes recipients identically, which is what
  // makes the per-recipient idempotency key below reproducible.
  reminders.sort((a, b) => a.attendeeEmail.localeCompare(b.attendeeEmail));

  return reminders;
}

/**
 * The key that stops a second run from mailing the same person twice.
 *
 * Keyed on *recipient and day*, never on the tickets themselves. The ticket set
 * is rebuilt from a live query on every sweep, so keying on it would make the
 * key mutable: a seat cancelled — or bought — between two firings changes the
 * ids, mints a fresh key, and mails someone their second "you have something
 * today" of the morning. Recipient plus day is the thing that is actually
 * stable, and it is what the guarantee is stated in terms of.
 *
 * The address is digested rather than embedded because Resend receives this as
 * an HTTP header, and an attendee's email has no business in one. The digest is
 * over the same normalized form the grouping uses, so the two cannot disagree.
 *
 * The day and a purpose string go *inside* the digest, not just in front of it.
 * A bare `sha256(email)` is the same string forever, which both links one
 * person's keys day to day and matches straight against a generic email-hash
 * table. Folding them in makes the digest per-day and per-purpose while staying
 * constant across a single day, which is all the idempotency needs.
 *
 * Consequence, deliberate: a seat bought *after* the morning send earns no
 * second reminder. Registration already emails its own confirmation with the
 * schedule, and the daily nudge is once by design.
 */
export function buildSessionDayReminderKey(
  dayKey: string,
  attendeeEmail: string,
): string {
  const digest = createHash("sha256")
    .update(
      `program-session-day-reminder:${dayKey}:${attendeeEmail.trim().toLowerCase()}`,
    )
    .digest("hex")
    .slice(0, 32);

  return `program-session-day-reminder-${dayKey}-${digest}`;
}
