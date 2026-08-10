import "server-only";

import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { cache } from "react";

import type {
  OccurrenceLifecycleStatus,
  ProgramStatus,
  SessionStatus,
  SessionType,
} from "@/app/lib/programs/definitions";
import { resolveAvailability } from "@/app/lib/programs/inventory";
import { resolveAttendeeIdentity } from "@/app/lib/programs/registration";
import {
  countCheckedIn,
  resolveRosterSeatState,
  rosterStateOrder,
  summarizeRoster,
  type RosterSeatState,
  type RosterTotals,
} from "@/app/lib/programs/roster";
import { db } from "@/db";
import {
  programs,
  programSessions,
  sessionOccurrences,
  sessionPurchaseLines,
  sessionWaitlistEntries,
} from "@/db/schema";

/** One seat in one occurrence, as the admin roster shows it. */
export type RosterEntry = {
  lineId: number;
  purchaseId: number;
  occurrenceId: number;
  state: RosterSeatState;
  attendeeName: string;
  attendeeEmail: string;
  /** Only guests give one; a signed-in buyer's phone lives on their profile. */
  attendeePhone: string | null;
  isGuest: boolean;
  ticketCode: string | null;
  /**
   * When this person came through the door, or null if they have not. Survives
   * a later ticket cancellation, so a released row can still carry a time —
   * that is the history, deliberately kept (§6.15).
   */
  checkedInAt: Date | null;
  unitPrice: number;
  promoCode: string | null;
  promoPartnerName: string | null;
  isFree: boolean;
  holdExpiresAt: Date | null;
  createdAt: Date;
};

export type OccurrenceRosterSummary = {
  occurrenceId: number;
  capacity: number;
  totals: RosterTotals;
  remaining: number;
  isSoldOut: boolean;
  waitlistActive: number;
  /**
   * Arrivals among the seats that are still `confirmed`, so the badge reads as
   * a subset of them rather than exceeding them. An attendance left behind by
   * a ticket cancelled after it was scanned stays visible on its own row, but
   * is not part of "who is in the room".
   *
   * Not folded into `RosterTotals`: check-in is orthogonal to seat occupancy,
   * and adding it there would break the partition `roster.test.ts` pins.
   */
  checkedIn: number;
};

/**
 * Everyone who has taken a seat in these occurrences, grouped by occurrence.
 *
 * One query for the whole session rather than one per occurrence: a session
 * lists a handful of occurrences of at most a few dozen seats, so the rows are
 * cheap, and computing every count in TypeScript from a single source is what
 * keeps the list totals and the detail page from ever disagreeing.
 *
 * Buyers who abandoned checkout are included and land in `released`. They are
 * not noise — "eleven people started and three finished" is the signal that
 * something in the payment step is broken.
 */
export async function fetchOccurrenceRosters(
  occurrenceIds: number[],
  options: { now?: Date } = {},
): Promise<Map<number, RosterEntry[]>> {
  const byOccurrence = new Map<number, RosterEntry[]>();
  if (occurrenceIds.length === 0) return byOccurrence;

  const now = options.now ?? new Date();

  const lines = await db.query.sessionPurchaseLines.findMany({
    where: inArray(sessionPurchaseLines.occurrenceId, occurrenceIds),
    with: {
      purchase: { with: { buyer: true, promoRedemption: true } },
      ticket: { with: { attendance: true } },
    },
    orderBy: [asc(sessionPurchaseLines.id)],
  });

  for (const line of lines) {
    const { purchase } = line;

    const state = resolveRosterSeatState(
      {
        purchaseStatus: purchase.status,
        ticketStatus: line.ticket?.status ?? null,
        holdExpiresAt: purchase.holdExpiresAt,
      },
      now,
    );

    /**
     * The ticket is the most authoritative name once issued — it is what was
     * printed and emailed. Before that, identity comes from the same helper
     * checkout used, so the roster shows exactly who the purchase was made as.
     */
    const identity =
      line.ticket !== null && line.ticket !== undefined
        ? {
            userId: purchase.userId,
            name: line.ticket.attendeeName,
            email: line.ticket.attendeeEmail,
          }
        : resolveAttendeeIdentity(
            purchase.buyer ?? null,
            purchase.guestName && purchase.guestEmail
              ? { name: purchase.guestName, email: purchase.guestEmail }
              : null,
          );

    const entries = byOccurrence.get(line.occurrenceId) ?? [];
    entries.push({
      lineId: line.id,
      purchaseId: purchase.id,
      occurrenceId: line.occurrenceId,
      state,
      // An anonymized purchase (a deleted account) keeps its seat but loses its
      // person, so the roster says so rather than rendering an empty cell.
      attendeeName: identity?.name ?? "Registro anonimizado",
      attendeeEmail: identity?.email ?? "—",
      attendeePhone: purchase.guestPhone,
      isGuest: purchase.userId === null,
      ticketCode: line.ticket?.code ?? null,
      checkedInAt: line.ticket?.attendance?.checkedInAt ?? null,
      unitPrice: line.unitPrice,
      promoCode: purchase.promoRedemption?.codeSnapshot ?? null,
      promoPartnerName: purchase.promoRedemption?.partnerNameSnapshot ?? null,
      isFree: purchase.paymentMode === "free",
      holdExpiresAt: purchase.holdExpiresAt,
      createdAt: purchase.createdAt,
    });
    byOccurrence.set(line.occurrenceId, entries);
  }

  for (const entries of byOccurrence.values()) {
    entries.sort(
      (a, b) =>
        rosterStateOrder(a.state) - rosterStateOrder(b.state) ||
        a.attendeeName.localeCompare(b.attendeeName, "es"),
    );
  }

  return byOccurrence;
}

/** Active waitlist size per occurrence — neither removed nor already converted. */
async function fetchWaitlistCounts(
  occurrenceIds: number[],
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (occurrenceIds.length === 0) return counts;

  const rows = await db
    .select({
      occurrenceId: sessionWaitlistEntries.occurrenceId,
      id: sessionWaitlistEntries.id,
    })
    .from(sessionWaitlistEntries)
    .where(
      and(
        inArray(sessionWaitlistEntries.occurrenceId, occurrenceIds),
        // Someone who withdrew, was taken off, or already bought their seat is
        // not still waiting — counting them would tell an admin to invite from
        // a list that is emptier than it looks.
        notInArray(sessionWaitlistEntries.status, ["removed", "converted"]),
      ),
    );

  for (const row of rows) {
    counts.set(row.occurrenceId, (counts.get(row.occurrenceId) ?? 0) + 1);
  }

  return counts;
}

/**
 * Turns one occurrence's roster into its seat counts.
 *
 * `remaining` comes from `resolveAvailability` — the same function the public
 * pages and checkout use — fed from the roster totals, so the number an admin
 * reads is the number a buyer is allowed to take.
 */
function buildSummary(
  occurrence: { id: number; capacity: number },
  entries: RosterEntry[],
  waitlistActive: number,
): OccurrenceRosterSummary {
  const totals = summarizeRoster(entries.map((entry) => entry.state));

  const availability = resolveAvailability({
    capacity: occurrence.capacity,
    validTickets: totals.confirmed,
    activeHolds:
      totals.awaitingReview + totals.changesRequested + totals.holding,
  });

  return {
    occurrenceId: occurrence.id,
    capacity: occurrence.capacity,
    totals,
    remaining: availability.remaining,
    isSoldOut: availability.isSoldOut,
    waitlistActive,
    checkedIn: countCheckedIn(entries),
  };
}

/** Seat counts for every occurrence in a list, for the admin session page. */
export async function fetchOccurrenceSummaries(
  occurrences: { id: number; capacity: number }[],
  options: { now?: Date } = {},
): Promise<Map<number, OccurrenceRosterSummary>> {
  const summaries = new Map<number, OccurrenceRosterSummary>();
  if (occurrences.length === 0) return summaries;

  // Pinned once. Left to default, every occurrence in the list would be judged
  // against a slightly different instant.
  const now = options.now ?? new Date();
  const ids = occurrences.map((occurrence) => occurrence.id);

  const [rosters, waitlist] = await Promise.all([
    fetchOccurrenceRosters(ids, { now }),
    fetchWaitlistCounts(ids),
  ]);

  for (const occurrence of occurrences) {
    summaries.set(
      occurrence.id,
      buildSummary(
        occurrence,
        rosters.get(occurrence.id) ?? [],
        waitlist.get(occurrence.id) ?? 0,
      ),
    );
  }

  return summaries;
}

/**
 * Both halves of one occurrence's dashboard from a single roster load.
 *
 * The detail page renders the counts and the list of people side by side, and
 * they have to be the same read. Calling `fetchOccurrenceSummaries` and
 * `fetchOccurrenceRosters` separately ran the query twice against two
 * independently defaulted `now` values — a hold expiring in the gap would be
 * `holding` in the badge and `released` in the table, on the same screen.
 */
export async function fetchOccurrenceDashboard(
  occurrence: { id: number; capacity: number },
  options: { now?: Date } = {},
): Promise<{ summary: OccurrenceRosterSummary; entries: RosterEntry[] }> {
  const now = options.now ?? new Date();

  const [rosters, waitlist] = await Promise.all([
    fetchOccurrenceRosters([occurrence.id], { now }),
    fetchWaitlistCounts([occurrence.id]),
  ]);

  const entries = rosters.get(occurrence.id) ?? [];

  return {
    summary: buildSummary(
      occurrence,
      entries,
      waitlist.get(occurrence.id) ?? 0,
    ),
    entries,
  };
}

/** One occurrence as the program-wide roster needs it: schedule and lifecycle, no counts. */
export type ProgramRosterOccurrence = {
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
};

export type ProgramRosterSession = {
  id: number;
  title: string;
  type: SessionType;
  status: SessionStatus;
};

export type ProgramRoster = {
  /** Pinned once. Every count on the screen is judged against this instant. */
  now: Date;
  programStatus: ProgramStatus;
  sessions: ProgramRosterSession[];
  occurrences: ProgramRosterOccurrence[];
  entries: RosterEntry[];
  waitlistByOccurrence: Record<number, number>;
};

/**
 * Every enrollment in a program, across every session and occurrence, for the
 * program-wide dashboard (docs/PRD-program-enrollments-dashboard.md).
 *
 * Reuses `fetchOccurrenceRosters` unchanged over every occurrence id in the
 * program rather than a bespoke aggregate query, so this screen's numbers are
 * structurally the same read as the occurrence page's — invariant 1.
 *
 * Display strings for sessions and occurrences are deliberately not joined
 * onto entries here; the client joins by id (§7.2), so there is one source
 * per fact instead of a snapshot that can drift from the live schedule.
 */
export async function fetchProgramRoster(
  programId: number,
  options: { now?: Date } = {},
): Promise<ProgramRoster> {
  const now = options.now ?? new Date();

  const [program, sessions] = await Promise.all([
    db.query.programs.findFirst({
      where: eq(programs.id, programId),
      columns: { status: true },
    }),
    db.query.programSessions.findMany({
      where: eq(programSessions.programId, programId),
      columns: { id: true, title: true, type: true, status: true },
      orderBy: [asc(programSessions.id)],
      with: {
        occurrences: {
          with: { venue: true },
          orderBy: [asc(sessionOccurrences.startsAt)],
        },
      },
    }),
  ]);

  // The route resolves `notFound()` before calling this; a program deleted in
  // the gap between that check and this query has nothing left to roster.
  if (!program) {
    return {
      now,
      programStatus: "draft",
      sessions: [],
      occurrences: [],
      entries: [],
      waitlistByOccurrence: {},
    };
  }

  const occurrences: ProgramRosterOccurrence[] = sessions.flatMap((session) =>
    session.occurrences.map((occurrence) => ({
      occurrenceId: occurrence.id,
      sessionId: session.id,
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
      capacity: occurrence.capacity,
      venueName: occurrence.venue?.name ?? null,
      room: occurrence.room,
      lifecycleStatus: occurrence.lifecycleStatus,
      rescheduledAt: occurrence.rescheduledAt,
      salesStartAt: occurrence.salesStartAt,
      salesEndAt: occurrence.salesEndAt,
      salesClosedAt: occurrence.salesClosedAt,
    })),
  );

  const occurrenceIds = occurrences.map(
    (occurrence) => occurrence.occurrenceId,
  );

  const [rosters, waitlist] = await Promise.all([
    fetchOccurrenceRosters(occurrenceIds, { now }),
    fetchWaitlistCounts(occurrenceIds),
  ]);

  const entries = occurrenceIds.flatMap((id) => rosters.get(id) ?? []);

  return {
    now,
    programStatus: program.status,
    sessions: sessions.map((session) => ({
      id: session.id,
      title: session.title,
      type: session.type,
      status: session.status,
    })),
    occurrences,
    entries,
    waitlistByOccurrence: Object.fromEntries(waitlist),
  };
}

/** The occurrence plus the context the detail page's heading needs. */
export const fetchOccurrenceForAdmin = cache(async (occurrenceId: number) => {
  return db.query.sessionOccurrences.findFirst({
    where: eq(sessionOccurrences.id, occurrenceId),
    with: {
      venue: true,
      session: { with: { program: true } },
    },
  });
});

export type OccurrenceForAdmin = NonNullable<
  Awaited<ReturnType<typeof fetchOccurrenceForAdmin>>
>;

export type { RosterSeatState };
