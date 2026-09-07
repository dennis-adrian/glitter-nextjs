import type {
  OccurrenceLifecycleStatus,
  SessionStatus,
  SessionType,
} from "@/app/lib/programs/definitions";
import { resolveAvailability } from "@/app/lib/programs/inventory";
import type {
  ProgramRosterOccurrence,
  ProgramRosterSession,
  RosterEntry,
} from "@/app/lib/programs/occurrence-queries";
import { summarizeRoster, type RosterTotals } from "@/app/lib/programs/roster";

/** One occurrence's rollup row (§5.5): schedule, lifecycle, and seat counts. */
export type OccurrenceRollup = {
  occurrenceId: number;
  sessionId: number;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  venueName: string | null;
  room: string | null;
  lifecycleStatus: OccurrenceLifecycleStatus;
  rescheduledAt: Date | null;
  salesStartAt: Date | null;
  salesEndAt: Date | null;
  salesClosedAt: Date | null;
  totals: RosterTotals;
  remaining: number;
  isSoldOut: boolean;
  waitlistActive: number;
};

/** One session's rollup row (§5.4): summed across its occurrence rollups. */
export type SessionRollup = {
  sessionId: number;
  title: string;
  type: SessionType;
  status: SessionStatus;
  occurrenceCount: number;
  earliestStartsAt: Date | null;
  totals: RosterTotals;
  capacity: number;
  remaining: number;
  isSoldOut: boolean;
  waitlistActive: number;
};

/** Every entry, grouped by the live occurrence it belongs to (invariant 2). */
export function groupEntriesByOccurrence(
  entries: RosterEntry[],
): Map<number, RosterEntry[]> {
  const byOccurrence = new Map<number, RosterEntry[]>();

  for (const entry of entries) {
    const group = byOccurrence.get(entry.occurrenceId);
    if (group) {
      group.push(entry);
    } else {
      byOccurrence.set(entry.occurrenceId, [entry]);
    }
  }

  return byOccurrence;
}

/**
 * One rollup row per occurrence in the program, chronologically ascending.
 *
 * Grouped by `occurrence.occurrenceId` — the live occurrence — never by a
 * purchase-time snapshot, so a rescheduled occurrence stays one group
 * (invariant 2).
 */
export function buildOccurrenceRollups(
  occurrences: ProgramRosterOccurrence[],
  entries: RosterEntry[],
  waitlistByOccurrence: Record<number, number>,
): OccurrenceRollup[] {
  const byOccurrence = groupEntriesByOccurrence(entries);

  return occurrences
    .map((occurrence) => {
      const occurrenceEntries =
        byOccurrence.get(occurrence.occurrenceId) ?? [];
      const totals = summarizeRoster(
        occurrenceEntries.map((entry) => entry.state),
      );
      const availability = resolveAvailability({
        capacity: occurrence.capacity,
        validTickets: totals.confirmed,
        activeHolds:
          totals.awaitingReview + totals.changesRequested + totals.holding,
      });

      return {
        occurrenceId: occurrence.occurrenceId,
        sessionId: occurrence.sessionId,
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        capacity: occurrence.capacity,
        venueName: occurrence.venueName,
        room: occurrence.room,
        lifecycleStatus: occurrence.lifecycleStatus,
        rescheduledAt: occurrence.rescheduledAt,
        salesStartAt: occurrence.salesStartAt,
        salesEndAt: occurrence.salesEndAt,
        salesClosedAt: occurrence.salesClosedAt,
        totals,
        remaining: availability.remaining,
        isSoldOut: availability.isSoldOut,
        waitlistActive: waitlistByOccurrence[occurrence.occurrenceId] ?? 0,
      };
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

function sumTotals(list: RosterTotals[]): RosterTotals {
  const sum: RosterTotals = {
    confirmed: 0,
    awaitingReview: 0,
    changesRequested: 0,
    holding: 0,
    released: 0,
    occupied: 0,
    needsAction: 0,
  };

  for (const totals of list) {
    sum.confirmed += totals.confirmed;
    sum.awaitingReview += totals.awaitingReview;
    sum.changesRequested += totals.changesRequested;
    sum.holding += totals.holding;
    sum.released += totals.released;
    sum.occupied += totals.occupied;
    sum.needsAction += totals.needsAction;
  }

  return sum;
}

/**
 * One rollup row per session, ordered by earliest occurrence start.
 *
 * `remaining` is never the sum of each occurrence's own `remaining` — that
 * would double-floor when one occurrence is over capacity while another has
 * room. It comes from a single `resolveAvailability` call at the session's
 * own grain instead (invariant 4).
 *
 * `isSoldOut` can't reuse that number, though: the PRD calls a session sold
 * out only when *every* occurrence is (§5.4), which is a per-occurrence AND,
 * not a property of the aggregate — the two can disagree exactly in the
 * over-capacity case above.
 */
export function buildSessionRollups(
  sessions: ProgramRosterSession[],
  occurrenceRollups: OccurrenceRollup[],
): SessionRollup[] {
  const bySession = new Map<number, OccurrenceRollup[]>();
  for (const rollup of occurrenceRollups) {
    const group = bySession.get(rollup.sessionId);
    if (group) {
      group.push(rollup);
    } else {
      bySession.set(rollup.sessionId, [rollup]);
    }
  }

  return sessions
    .map((session) => {
      const rollups = bySession.get(session.id) ?? [];
      const totals = sumTotals(rollups.map((rollup) => rollup.totals));
      const capacity = rollups.reduce(
        (sum, rollup) => sum + rollup.capacity,
        0,
      );
      const availability = resolveAvailability({
        capacity,
        validTickets: totals.confirmed,
        activeHolds:
          totals.awaitingReview + totals.changesRequested + totals.holding,
      });
      const earliestStartsAt = rollups.reduce<Date | null>(
        (earliest, rollup) => {
          if (!earliest) return rollup.startsAt;
          return rollup.startsAt.getTime() < earliest.getTime()
            ? rollup.startsAt
            : earliest;
        },
        null,
      );

      return {
        sessionId: session.id,
        title: session.title,
        type: session.type,
        status: session.status,
        occurrenceCount: rollups.length,
        earliestStartsAt,
        totals,
        capacity,
        remaining: availability.remaining,
        isSoldOut:
          rollups.length > 0 && rollups.every((rollup) => rollup.isSoldOut),
        waitlistActive: rollups.reduce(
          (sum, rollup) => sum + rollup.waitlistActive,
          0,
        ),
      };
    })
    .sort((a, b) => {
      // A session with no occurrences has no schedule to sort by; it sinks
      // to the bottom rather than claiming the top slot as an artificial
      // earliest.
      if (!a.earliestStartsAt && !b.earliestStartsAt) return 0;
      if (!a.earliestStartsAt) return 1;
      if (!b.earliestStartsAt) return -1;
      return a.earliestStartsAt.getTime() - b.earliestStartsAt.getTime();
    });
}

/** Strips a leading "#" so "#1234" and "1234" both match the same purchase id. */
function normalizeSearchTerm(query: string): string {
  return query.trim().toLowerCase().replace(/^#/, "");
}

/**
 * Whether one entry matches a program-roster search (§5.8): attendee name,
 * email, ticket code, or purchase id.
 *
 * Spans every seat state, including `released` — the toggle that hides
 * released rows in the browsing view does not apply to search, because a
 * support request about a dead checkout is exactly when someone needs to be
 * findable.
 */
export function matchesRosterSearch(
  entry: RosterEntry,
  query: string,
): boolean {
  const term = normalizeSearchTerm(query);
  if (term.length === 0) return true;

  if (entry.attendeeName.toLowerCase().includes(term)) return true;
  if (entry.attendeeEmail.toLowerCase().includes(term)) return true;
  if (entry.ticketCode && entry.ticketCode.toLowerCase().includes(term)) {
    return true;
  }
  if (String(entry.purchaseId).includes(term)) return true;

  return false;
}
