import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fake = vi.hoisted(() => ({
  executor: null as unknown as {
    select: (...args: unknown[]) => unknown;
  },
}));

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => fake.executor.select(...args),
    transaction: (callback: (tx: unknown) => unknown) =>
      callback(fake.executor),
    // The agenda's roster read; no seats sold is enough for a summary.
    query: { sessionPurchaseLines: { findMany: async () => [] } },
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

import { effectiveVenueIdSql } from "@/app/lib/programs/effective-venue";
import { fetchCheckInAgenda } from "@/app/lib/programs/occurrence-queries";
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
