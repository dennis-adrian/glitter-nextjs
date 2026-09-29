import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fake = vi.hoisted(() => ({
  executor: null as unknown as {
    select: (...args: unknown[]) => unknown;
  },
}));

const relational = vi.hoisted(() => ({
  purchaseFindFirst: vi.fn(),
  purchaseFindMany: vi.fn(),
  occurrenceFindFirst: vi.fn(),
  programFindFirst: vi.fn(),
  sessionFindMany: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => fake.executor.select(...args),
    transaction: (callback: (tx: unknown) => unknown) =>
      callback(fake.executor),
    query: {
      // The rosters' seat read; no seats sold is enough for a summary.
      sessionPurchaseLines: { findMany: async () => [] },
      sessionPurchases: {
        findFirst: relational.purchaseFindFirst,
        findMany: relational.purchaseFindMany,
      },
      sessionOccurrences: { findFirst: relational.occurrenceFindFirst },
      programs: { findFirst: relational.programFindFirst },
      programSessions: { findMany: relational.sessionFindMany },
    },
  },
}));

const mocks = vi.hoisted(() => ({
  sendPaymentApprovedEmail: vi.fn(),
  sendSessionDayReminderEmail: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  featureFlagGuard: async () => null,
}));
vi.mock("@/app/lib/users/helpers", () => ({
  requireAdminOrFestivalAdmin: async () => ({ id: 1 }),
}));
vi.mock("@/app/lib/emails/helpers", () => ({
  queueEmails: async <T>(items: T[], send: (item: T) => Promise<void>) => {
    for (const item of items) await send(item);
  },
}));
vi.mock("@/app/lib/programs/notifications", () => ({
  buildBuyerLandingUrl: () => null,
  buildSecureLinkUrl: () => "https://example.test/purchase",
  sendPaymentApprovedEmail: mocks.sendPaymentApprovedEmail,
  sendPurchaseLinkEmail: vi.fn(),
  sendSessionDayReminderEmail: mocks.sendSessionDayReminderEmail,
  sendVoucherChangesEmail: vi.fn(),
}));

import type { Venue } from "@/app/lib/programs/definitions";
import {
  effectiveVenueIdSql,
  occurrenceVenueSources,
  withEffectiveVenue,
} from "@/app/lib/programs/effective-venue";
import {
  fetchCheckInAgenda,
  fetchOccurrenceForAdmin,
  fetchProgramRoster,
} from "@/app/lib/programs/occurrence-queries";
import {
  fetchPurchaseForAccess,
  fetchPurchaseForAdmin,
  fetchPurchasesAwaitingReview,
  fetchPurchasesForUser,
} from "@/app/lib/programs/purchase-queries";
import { reviewPurchase } from "@/app/lib/programs/review-actions";
import { sendSessionDayReminders } from "@/app/lib/programs/scheduled-actions";
import { resendPurchaseLink } from "@/app/lib/programs/support-actions";
import {
  sessionPurchaseLines,
  sessionPurchases,
  sessionPurchaseVouchers,
  sessionTickets,
  venues,
} from "@/db/schema";

const INHERITED_VENUE =
  'coalesce("session_occurrences"."venue_id", "program_sessions"."venue_id", "programs"."default_venue_id")';

type Call = { method: string; args: unknown[] };
type Query = Call[];

/**
 * Stand-in for a drizzle executor that records every builder chain.
 *
 * Each chain is thenable and resolves to whatever `rowsFor` returns for it, so
 * one fake serves every query shape these modules build. Tables are matched by
 * reference, as in `anonymization.test.ts`.
 */
function createExecutor(rowsFor: (query: Query) => unknown) {
  const queries: Query[] = [];

  const begin =
    (method: string) =>
    (...args: unknown[]) => {
      const query: Query = [{ method, args }];
      queries.push(query);

      const chain: unknown = new Proxy(
        {},
        {
          get(_, property) {
            if (property === "then") {
              return (
                resolve: (value: unknown) => unknown,
                reject: (reason: unknown) => unknown,
              ) =>
                Promise.resolve()
                  .then(() => rowsFor(query))
                  .then(resolve, reject);
            }
            return (...next: unknown[]) => {
              query.push({ method: String(property), args: next });
              return chain;
            };
          },
        },
      );

      return chain;
    };

  fake.executor = {
    select: begin("select"),
    update: begin("update"),
    insert: begin("insert"),
  } as typeof fake.executor;

  return queries;
}

function source(query: Query): unknown {
  return query[0].method === "select"
    ? query.find((call) => call.method === "from")?.args[0]
    : query[0].args[0];
}

function isJoined(query: Query): boolean {
  return query.some((call) => call.method === "innerJoin");
}

/** Every `leftJoin(venues, …)` condition the recorded queries used, as SQL. */
function venueJoins(queries: Query[]): string[] {
  return queries.flatMap((query) =>
    query
      .filter((call) => call.method === "leftJoin" && call.args[0] === venues)
      .map((call) => new PgDialect().sqlToQuery(call.args[1] as SQL).sql),
  );
}

describe("effectiveVenueIdSql", () => {
  it("falls back in the same order as resolveEffectiveVenueId", () => {
    // occurrence → session → program default. `state.test.ts` pins that
    // order for the in-code resolver checkout and registration use.
    expect(new PgDialect().sqlToQuery(effectiveVenueIdSql())).toEqual({
      sql: INHERITED_VENUE,
      params: [],
    });
  });

  it("builds a fresh expression per call", () => {
    expect(effectiveVenueIdSql()).not.toBe(effectiveVenueIdSql());
  });
});

/**
 * Each of these once joined `venues` on the occurrence's own column, so an
 * occurrence inheriting its venue from the session or program reached the
 * buyer, or the door, with no location.
 */
describe("queries that name an occurrence's venue", () => {
  beforeEach(() => {
    mocks.sendPaymentApprovedEmail.mockReset();
    mocks.sendSessionDayReminderEmail.mockReset();
    mocks.sendSessionDayReminderEmail.mockResolvedValue(true);
  });

  const notifyRow = {
    sessionTitle: "Taller de ilustración",
    sessionType: "workshop",
    programName: "Glitter Academy",
    startsAt: new Date("2026-10-10T23:00:00.000Z"),
    endsAt: new Date("2026-10-11T01:00:00.000Z"),
    room: null,
    venueName: "Casa Glitter",
    ticketCode: "GLT-001",
    ticketStatus: "valid",
  };

  const guestPurchase = {
    id: 42,
    programId: 3,
    userId: null,
    guestName: "Ana",
    guestEmail: "ana@example.com",
    paymentMode: "bank_qr",
    status: "under_verification",
  };

  it("approval email: the ticket carries the inherited venue", async () => {
    const queries = createExecutor((query) => {
      const table = source(query);
      if (table === sessionPurchases && query[0].method === "select") {
        return [guestPurchase];
      }
      if (table === sessionPurchaseVouchers) return [{ id: 1 }];
      if (table === sessionPurchaseLines) {
        return isJoined(query) ? [notifyRow] : [{ id: 10, occurrenceId: 5 }];
      }
      if (table === sessionTickets) return [{ id: 99 }];
      return [];
    });

    const result = await reviewPurchase({
      purchaseId: 42,
      decision: "approve",
    });

    expect(result).toMatchObject({ success: true, ticketsIssued: 1 });
    expect(venueJoins(queries)).toEqual([`"venues"."id" = ${INHERITED_VENUE}`]);
    expect(mocks.sendPaymentApprovedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ venueName: "Casa Glitter" }),
    );
  });

  it("resent purchase email: the ticket carries the inherited venue", async () => {
    const queries = createExecutor((query) => {
      const table = source(query);
      if (table === sessionPurchases && query[0].method === "select") {
        return [guestPurchase];
      }
      if (table === sessionPurchaseLines) return [notifyRow];
      return [];
    });

    const result = await resendPurchaseLink({
      purchaseId: 42,
      reason: "No le llegó el correo",
    });

    expect(result).toMatchObject({ success: true });
    expect(venueJoins(queries)).toEqual([`"venues"."id" = ${INHERITED_VENUE}`]);
    expect(mocks.sendPaymentApprovedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ venueName: "Casa Glitter" }),
    );
  });

  it("day-of reminder: each line carries the inherited venue", async () => {
    const queries = createExecutor((query) =>
      source(query) === sessionTickets
        ? [
            {
              ticketId: 1,
              attendeeName: "Ana",
              attendeeEmail: "ana@example.com",
              attendeeUserId: null,
              ...notifyRow,
            },
          ]
        : [],
    );

    await sendSessionDayReminders(new Date("2026-10-10T14:00:00.000Z"));

    expect(venueJoins(queries)).toEqual([`"venues"."id" = ${INHERITED_VENUE}`]);
    expect(mocks.sendSessionDayReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [expect.objectContaining({ venueName: "Casa Glitter" })],
      }),
    );
  });

  it("check-in door agenda: the entry carries the inherited venue", async () => {
    const queries = createExecutor((query) =>
      isJoined(query)
        ? [
            {
              occurrenceId: 5,
              capacity: 20,
              programName: notifyRow.programName,
              sessionTitle: notifyRow.sessionTitle,
              sessionType: notifyRow.sessionType,
              startsAt: notifyRow.startsAt,
              endsAt: notifyRow.endsAt,
              venueName: "Casa Glitter",
              room: null,
            },
          ]
        : [],
    );

    const now = new Date("2026-10-10T14:00:00.000Z");
    const entries = await fetchCheckInAgenda(
      {
        from: new Date("2026-10-10T04:00:00.000Z"),
        todayEnd: new Date("2026-10-11T04:00:00.000Z"),
        to: new Date("2026-10-13T04:00:00.000Z"),
      },
      { now },
    );

    expect(venueJoins(queries)).toEqual([`"venues"."id" = ${INHERITED_VENUE}`]);
    expect(entries).toEqual([
      expect.objectContaining({ occurrenceId: 5, venueName: "Casa Glitter" }),
    ]);
  });
});

function venue(id: number, name: string): Venue {
  return {
    id,
    name,
    address: null,
    locationLabel: null,
    locationUrl: null,
    isActive: true,
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
  };
}

const OWN = venue(1, "Sala 2");
const SESSION = venue(2, "Auditorio");
const PROGRAM = venue(3, "Casa Glitter");

/** An occurrence as `occurrenceVenueSources` loads it. */
function sourced(
  own: Venue | null,
  session: Venue | null,
  program: Venue | null,
) {
  return {
    id: 5,
    room: null,
    venue: own,
    session: {
      id: 7,
      venue: session,
      program: { id: 3, defaultVenue: program },
    },
  };
}

describe("withEffectiveVenue", () => {
  it.each([
    ["its own venue", sourced(OWN, SESSION, PROGRAM), OWN],
    ["the session's venue", sourced(null, SESSION, PROGRAM), SESSION],
    ["the program default", sourced(null, null, PROGRAM), PROGRAM],
    ["nothing when no level names one", sourced(null, null, null), null],
  ])("resolves an occurrence to %s", (_, occurrence, expected) => {
    expect(withEffectiveVenue(occurrence).effectiveVenue).toBe(expected);
  });

  it("drops the override so a page cannot render it by mistake", () => {
    const resolved = withEffectiveVenue(sourced(null, SESSION, PROGRAM));

    expect(resolved).not.toHaveProperty("venue");
    expect(resolved).toMatchObject({ id: 5, room: null });
  });
});

/**
 * Each of these once loaded only `occurrence.venue`, so a page showed no
 * location for an occurrence inheriting its session's or program's venue.
 */
describe("relational reads that name an occurrence's venue", () => {
  beforeEach(() => {
    for (const mock of Object.values(relational)) mock.mockReset();
  });

  const purchase = {
    id: 42,
    lines: [{ id: 10, occurrence: sourced(null, SESSION, PROGRAM) }],
  };

  it.each([
    [
      "buyer's purchase page",
      () => fetchPurchaseForAccess(42),
      relational.purchaseFindFirst,
      purchase,
    ],
    [
      "admin purchase detail",
      () => fetchPurchaseForAdmin(43),
      relational.purchaseFindFirst,
      purchase,
    ],
    [
      "buyer's purchase list",
      () => fetchPurchasesForUser(9),
      relational.purchaseFindMany,
      [purchase],
    ],
    [
      "review queue",
      () => fetchPurchasesAwaitingReview(),
      relational.purchaseFindMany,
      [purchase],
    ],
  ] as const)(
    "%s: each line carries the inherited venue",
    async (_, load, query, rows) => {
      query.mockResolvedValue(rows);

      const result = await load();
      const [first] = Array.isArray(result) ? result : [result];

      expect(query.mock.calls[0][0].with.lines.with.occurrence).toEqual({
        with: occurrenceVenueSources,
      });
      expect(first.lines[0].occurrence.effectiveVenue).toBe(SESSION);
      expect(first.lines[0].occurrence).not.toHaveProperty("venue");
    },
  );

  it("occurrence page and door screen headings: the inherited venue", async () => {
    relational.occurrenceFindFirst.mockResolvedValue(
      sourced(null, null, PROGRAM),
    );

    const occurrence = await fetchOccurrenceForAdmin(5);

    expect(relational.occurrenceFindFirst.mock.calls[0][0].with).toBe(
      occurrenceVenueSources,
    );
    expect(occurrence?.effectiveVenue).toBe(PROGRAM);
    expect(occurrence).not.toHaveProperty("venue");
  });

  it("program-wide roster: each occurrence carries the inherited venue", async () => {
    createExecutor(() => []);

    const schedule = {
      startsAt: new Date("2026-10-10T23:00:00.000Z"),
      endsAt: new Date("2026-10-11T01:00:00.000Z"),
      capacity: 20,
      room: null,
      lifecycleStatus: "scheduled",
      rescheduledAt: null,
      salesStartAt: null,
      salesEndAt: null,
      salesClosedAt: null,
    };

    relational.programFindFirst.mockResolvedValue({
      status: "published",
      defaultVenue: PROGRAM,
    });
    relational.sessionFindMany.mockResolvedValue([
      {
        id: 1,
        title: "Taller de ilustración",
        type: "workshop",
        status: "published",
        venue: SESSION,
        occurrences: [
          { id: 10, venue: OWN, ...schedule },
          { id: 11, venue: null, ...schedule },
        ],
      },
      {
        id: 2,
        title: "Cómo vivir del arte",
        type: "talk",
        status: "published",
        venue: null,
        occurrences: [{ id: 12, venue: null, ...schedule }],
      },
    ]);

    const roster = await fetchProgramRoster(3, {
      now: new Date("2026-10-10T14:00:00.000Z"),
    });

    expect(relational.programFindFirst.mock.calls[0][0].with).toEqual({
      defaultVenue: true,
    });
    expect(relational.sessionFindMany.mock.calls[0][0].with).toMatchObject({
      venue: true,
    });
    expect(
      roster.occurrences.map(({ occurrenceId, venueName }) => [
        occurrenceId,
        venueName,
      ]),
    ).toEqual([
      [10, "Sala 2"],
      [11, "Auditorio"],
      [12, "Casa Glitter"],
    ]);
  });
});
