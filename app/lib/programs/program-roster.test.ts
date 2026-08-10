import { describe, expect, it } from "vitest";

import type {
  ProgramRosterOccurrence,
  ProgramRosterSession,
  RosterEntry,
} from "@/app/lib/programs/occurrence-queries";
import {
  buildOccurrenceRollups,
  buildSessionRollups,
  groupEntriesByOccurrence,
  matchesRosterSearch,
} from "@/app/lib/programs/program-roster";
import { summarizeRoster, type RosterSeatState } from "@/app/lib/programs/roster";

function occurrence(
  overrides: Partial<ProgramRosterOccurrence> = {},
): ProgramRosterOccurrence {
  return {
    occurrenceId: 1,
    sessionId: 10,
    startsAt: new Date("2026-08-10T18:00:00.000Z"),
    endsAt: new Date("2026-08-10T20:00:00.000Z"),
    capacity: 20,
    venueName: "Sala 2",
    room: null,
    lifecycleStatus: "scheduled",
    rescheduledAt: null,
    salesStartAt: null,
    salesEndAt: null,
    salesClosedAt: null,
    ...overrides,
  };
}

function session(
  overrides: Partial<ProgramRosterSession> = {},
): ProgramRosterSession {
  return {
    id: 10,
    title: "Taller A",
    type: "workshop",
    status: "published",
    ...overrides,
  };
}

function entry(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    lineId: 1,
    purchaseId: 100,
    occurrenceId: 1,
    state: "confirmed",
    attendeeName: "Ana Gómez",
    attendeeEmail: "ana@example.com",
    attendeePhone: null,
    isGuest: false,
    ticketCode: "ABC123",
    checkedInAt: null,
    unitPrice: 70,
    promoCode: null,
    promoPartnerName: null,
    isFree: false,
    holdExpiresAt: null,
    createdAt: new Date("2026-07-30T15:00:00.000Z"),
    ...overrides,
  };
}

describe("groupEntriesByOccurrence", () => {
  it("groups by the live occurrence id on the entry, not any snapshot", () => {
    const entries = [
      entry({ lineId: 1, occurrenceId: 1 }),
      entry({ lineId: 2, occurrenceId: 2 }),
      entry({ lineId: 3, occurrenceId: 1 }),
    ];

    const grouped = groupEntriesByOccurrence(entries);

    expect(grouped.get(1)?.map((e) => e.lineId)).toEqual([1, 3]);
    expect(grouped.get(2)?.map((e) => e.lineId)).toEqual([2]);
  });
});

describe("buildOccurrenceRollups", () => {
  it("sums seat states per occurrence and derives remaining from resolveAvailability", () => {
    const occurrences = [occurrence({ occurrenceId: 1, capacity: 3 })];
    const entries = [
      entry({ lineId: 1, occurrenceId: 1, state: "confirmed" }),
      entry({ lineId: 2, occurrenceId: 1, state: "holding" }),
      entry({ lineId: 3, occurrenceId: 1, state: "released" }),
    ];

    const [rollup] = buildOccurrenceRollups(occurrences, entries, {});

    expect(rollup.totals.confirmed).toBe(1);
    expect(rollup.totals.holding).toBe(1);
    expect(rollup.totals.released).toBe(1);
    // Released never occupies a seat, so remaining excludes it.
    expect(rollup.remaining).toBe(1);
    expect(rollup.isSoldOut).toBe(false);
  });

  it("keeps a rescheduled occurrence as one group rather than splitting it", () => {
    // The occurrence's own `startsAt` moved; entries carry only the live
    // `occurrenceId`, so every entry still lands in the same rollup.
    const occurrences = [
      occurrence({
        occurrenceId: 1,
        startsAt: new Date("2026-09-01T18:00:00.000Z"),
        rescheduledAt: new Date("2026-08-01T00:00:00.000Z"),
      }),
    ];
    const entries = [
      entry({ lineId: 1, occurrenceId: 1 }),
      entry({ lineId: 2, occurrenceId: 1 }),
    ];

    const rollups = buildOccurrenceRollups(occurrences, entries, {});

    expect(rollups).toHaveLength(1);
    expect(rollups[0].totals.confirmed).toBe(2);
  });

  it("orders occurrences chronologically ascending", () => {
    const occurrences = [
      occurrence({ occurrenceId: 2, startsAt: new Date("2026-08-12T00:00:00.000Z") }),
      occurrence({ occurrenceId: 1, startsAt: new Date("2026-08-10T00:00:00.000Z") }),
    ];

    const rollups = buildOccurrenceRollups(occurrences, [], {});

    expect(rollups.map((r) => r.occurrenceId)).toEqual([1, 2]);
  });

  it("carries the waitlist count for its own occurrence only", () => {
    const occurrences = [occurrence({ occurrenceId: 1 }), occurrence({ occurrenceId: 2 })];

    const rollups = buildOccurrenceRollups(occurrences, [], { 1: 4 });

    expect(rollups.find((r) => r.occurrenceId === 1)?.waitlistActive).toBe(4);
    expect(rollups.find((r) => r.occurrenceId === 2)?.waitlistActive).toBe(0);
  });
});

describe("buildSessionRollups", () => {
  it("sums occupied and capacity across a session's occurrences, matching the row-level totals", () => {
    const occurrences = [
      occurrence({ occurrenceId: 1, sessionId: 10, capacity: 30 }),
      occurrence({ occurrenceId: 2, sessionId: 10, capacity: 45 }),
    ];
    const entries = [
      ...Array.from({ length: 20 }, (_, i) =>
        entry({ lineId: i, occurrenceId: 1, state: "confirmed" }),
      ),
      ...Array.from({ length: 38 }, (_, i) =>
        entry({ lineId: 100 + i, occurrenceId: 2, state: "confirmed" }),
      ),
    ];

    const occurrenceRollups = buildOccurrenceRollups(occurrences, entries, {});
    const [rollup] = buildSessionRollups([session()], occurrenceRollups);

    expect(rollup.capacity).toBe(75);
    expect(rollup.totals.occupied).toBe(58);
    expect(rollup.remaining).toBe(17);
    // Session and occurrence totals must agree — invariant 3.
    const sumOfOccurrenceOccupied = occurrenceRollups.reduce(
      (sum, o) => sum + o.totals.occupied,
      0,
    );
    expect(rollup.totals.occupied).toBe(sumOfOccurrenceOccupied);
  });

  it("keeps the muted released count separate from the headline occupied count", () => {
    const occurrences = [occurrence({ occurrenceId: 1, sessionId: 10, capacity: 10 })];
    const entries = [
      entry({ lineId: 1, occurrenceId: 1, state: "confirmed" }),
      entry({ lineId: 2, occurrenceId: 1, state: "released" }),
      entry({ lineId: 3, occurrenceId: 1, state: "released" }),
    ];

    const occurrenceRollups = buildOccurrenceRollups(occurrences, entries, {});
    const [rollup] = buildSessionRollups([session()], occurrenceRollups);

    expect(rollup.totals.occupied).toBe(1);
    expect(rollup.totals.released).toBe(2);
  });

  it("is sold out only when every occurrence is sold out", () => {
    const occurrences = [
      occurrence({ occurrenceId: 1, sessionId: 10, capacity: 2 }),
      occurrence({ occurrenceId: 2, sessionId: 10, capacity: 2 }),
    ];
    const entries = [
      entry({ lineId: 1, occurrenceId: 1, state: "confirmed" }),
      entry({ lineId: 2, occurrenceId: 1, state: "confirmed" }),
      entry({ lineId: 3, occurrenceId: 2, state: "confirmed" }),
    ];

    const occurrenceRollups = buildOccurrenceRollups(occurrences, entries, {});
    const [rollup] = buildSessionRollups([session()], occurrenceRollups);

    // Occurrence 1 is full, occurrence 2 has one seat left.
    expect(rollup.isSoldOut).toBe(false);

    const fullEntries = [...entries, entry({ lineId: 4, occurrenceId: 2, state: "confirmed" })];
    const fullOccurrenceRollups = buildOccurrenceRollups(occurrences, fullEntries, {});
    const [fullRollup] = buildSessionRollups([session()], fullOccurrenceRollups);
    expect(fullRollup.isSoldOut).toBe(true);
  });

  it("is never sold out when it has no occurrences", () => {
    const [rollup] = buildSessionRollups([session()], []);
    expect(rollup.isSoldOut).toBe(false);
    expect(rollup.occurrenceCount).toBe(0);
  });

  it("orders sessions by earliest occurrence start, sinking scheduleless sessions last", () => {
    const sessions = [
      session({ id: 10 }),
      session({ id: 20, title: "Charla B" }),
      session({ id: 30, title: "Charla C" }),
    ];
    const occurrences = [
      occurrence({ occurrenceId: 1, sessionId: 10, startsAt: new Date("2026-08-15T00:00:00.000Z") }),
      occurrence({ occurrenceId: 2, sessionId: 20, startsAt: new Date("2026-08-05T00:00:00.000Z") }),
    ];

    const rollups = buildSessionRollups(sessions, buildOccurrenceRollups(occurrences, [], {}));

    expect(rollups.map((r) => r.sessionId)).toEqual([20, 10, 30]);
  });

  it("sums waitlist counts across a session's occurrences", () => {
    const occurrences = [
      occurrence({ occurrenceId: 1, sessionId: 10 }),
      occurrence({ occurrenceId: 2, sessionId: 10 }),
    ];
    const occurrenceRollups = buildOccurrenceRollups(occurrences, [], { 1: 2, 2: 3 });
    const [rollup] = buildSessionRollups([session()], occurrenceRollups);

    expect(rollup.waitlistActive).toBe(5);
  });
});

describe("program totals reconcile at every grain (invariant 3)", () => {
  it("program tiles equal the sum of session rollups equal the sum of occurrence rollups", () => {
    const sessions = [session({ id: 10 }), session({ id: 20, title: "Charla B" })];
    const occurrences = [
      occurrence({ occurrenceId: 1, sessionId: 10, capacity: 10 }),
      occurrence({ occurrenceId: 2, sessionId: 10, capacity: 10 }),
      occurrence({ occurrenceId: 3, sessionId: 20, capacity: 10 }),
    ];
    const states: RosterSeatState[] = [
      "confirmed",
      "confirmed",
      "awaiting_review",
      "changes_requested",
      "holding",
      "released",
      "released",
    ];
    const entries = states.map((state, i) =>
      entry({ lineId: i, occurrenceId: (i % 3) + 1, state }),
    );

    const programTotals = summarizeRoster(entries.map((e) => e.state));
    const occurrenceRollups = buildOccurrenceRollups(occurrences, entries, {});
    const sessionRollups = buildSessionRollups(sessions, occurrenceRollups);

    const sumFromSessions = sessionRollups.reduce(
      (sum, r) => sum + r.totals.occupied + r.totals.released,
      0,
    );
    const sumFromOccurrences = occurrenceRollups.reduce(
      (sum, r) => sum + r.totals.occupied + r.totals.released,
      0,
    );

    expect(programTotals.occupied + programTotals.released).toBe(sumFromSessions);
    expect(sumFromSessions).toBe(sumFromOccurrences);
    expect(sumFromOccurrences).toBe(entries.length);
  });
});

describe("matchesRosterSearch", () => {
  it("matches by attendee name, case-insensitively and partially", () => {
    expect(matchesRosterSearch(entry({ attendeeName: "Ana Gómez" }), "gómez")).toBe(true);
    expect(matchesRosterSearch(entry({ attendeeName: "Ana Gómez" }), "ANA")).toBe(true);
    expect(matchesRosterSearch(entry({ attendeeName: "Ana Gómez" }), "Carlos")).toBe(false);
  });

  it("matches by email and ticket code", () => {
    expect(
      matchesRosterSearch(entry({ attendeeEmail: "ana@example.com" }), "example.com"),
    ).toBe(true);
    expect(matchesRosterSearch(entry({ ticketCode: "XYZ789" }), "xyz")).toBe(true);
    expect(matchesRosterSearch(entry({ ticketCode: null }), "xyz")).toBe(false);
  });

  it("matches a purchase id whether or not the query has a leading #", () => {
    expect(matchesRosterSearch(entry({ purchaseId: 1234 }), "1234")).toBe(true);
    expect(matchesRosterSearch(entry({ purchaseId: 1234 }), "#1234")).toBe(true);
    expect(matchesRosterSearch(entry({ purchaseId: 1234 }), "5678")).toBe(false);
  });

  it("matches every seat state, including released", () => {
    expect(
      matchesRosterSearch(
        entry({ state: "released", attendeeName: "Abandonó Checkout" }),
        "abandonó",
      ),
    ).toBe(true);
  });

  it("matches everything for an empty query", () => {
    expect(matchesRosterSearch(entry(), "")).toBe(true);
    expect(matchesRosterSearch(entry(), "   ")).toBe(true);
  });
});
