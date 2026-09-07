import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

import { anonymizeProgramPurchasesForUser } from "@/app/lib/programs/anonymization";
import { sessionPurchases, sessionTickets } from "@/db/schema";

type Row = { id: number };

type Recorded = {
  ticketUpdates: Record<string, unknown>[];
  purchaseUpdates: Record<string, unknown>[];
  events: Record<string, unknown>[];
};

/**
 * Minimal stand-in for a drizzle executor, following the fake-transaction
 * approach `notifications.test.ts` uses for the sibling scrub function.
 *
 * Tables are matched by reference rather than by name, so the fake cannot
 * silently mis-route a call. Updates are recorded in invocation order, which
 * mirrors the fixture order the function iterates.
 */
function createExecutor(fixtures: { purchases: Row[]; tickets: Row[] }) {
  const recorded: Recorded = {
    ticketUpdates: [],
    purchaseUpdates: [],
    events: [],
  };

  const executor = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () =>
          table === sessionTickets ? fixtures.tickets : fixtures.purchases,
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (table === sessionTickets) recorded.ticketUpdates.push(values);
          else if (table === sessionPurchases)
            recorded.purchaseUpdates.push(values);
          else throw new Error("unexpected table in update()");
        },
      }),
    }),
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        recorded.events.push(values);
      },
    }),
  };

  return { executor, recorded };
}

describe("anonymizeProgramPurchasesForUser", () => {
  it("scrubs an attendee's ticket even when they bought nothing themselves", async () => {
    // The regression: a ticket bought by someone else. `attendeeUserId` is
    // ON DELETE SET NULL, so returning early here would delete the account and
    // strand this person's name and email on the ticket permanently.
    const { executor, recorded } = createExecutor({
      purchases: [],
      tickets: [{ id: 55 }],
    });

    const result = await anonymizeProgramPurchasesForUser(
      executor as never,
      7,
      new Date("2026-08-01T12:00:00.000Z"),
    );

    expect(result).toEqual({ purchases: 0, tickets: 1 });
    expect(recorded.ticketUpdates).toHaveLength(1);
    expect(recorded.ticketUpdates[0]).toMatchObject({
      attendeeUserId: null,
      attendeeName: "Perfil eliminado",
      attendeeEmail: "eliminado+55@perfil-eliminado.invalid",
    });
    // Nothing to do on the purchase side.
    expect(recorded.purchaseUpdates).toHaveLength(0);
    expect(recorded.events).toHaveLength(0);
  });

  it("does nothing when the user has neither purchases nor tickets", async () => {
    const { executor, recorded } = createExecutor({
      purchases: [],
      tickets: [],
    });

    const result = await anonymizeProgramPurchasesForUser(executor as never, 7);

    expect(result).toEqual({ purchases: 0, tickets: 0 });
    expect(recorded.ticketUpdates).toHaveLength(0);
    expect(recorded.purchaseUpdates).toHaveLength(0);
    expect(recorded.events).toHaveLength(0);
  });

  it("scrubs the buyer, revokes the link, and records an audit event", async () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const { executor, recorded } = createExecutor({
      purchases: [{ id: 19 }],
      tickets: [{ id: 11 }],
    });

    const result = await anonymizeProgramPurchasesForUser(
      executor as never,
      7,
      now,
    );

    expect(result).toEqual({ purchases: 1, tickets: 1 });
    expect(recorded.purchaseUpdates[0]).toMatchObject({
      userId: null,
      guestName: "Perfil eliminado",
      guestEmail: "eliminado+19@perfil-eliminado.invalid",
      accessTokenRevokedAt: now,
    });
    expect(recorded.events[0]).toMatchObject({
      purchaseId: 19,
      actorType: "system",
      eventType: "adjusted",
    });
  });

  it("gives each ticket its own placeholder address", async () => {
    // The partial unique index on (occurrenceId, lower(attendeeEmail)) rejects
    // a shared placeholder as soon as two scrubbed people held seats in the
    // same occurrence, so the address has to vary per row.
    const { executor, recorded } = createExecutor({
      purchases: [],
      tickets: [{ id: 11 }, { id: 12 }],
    });

    await anonymizeProgramPurchasesForUser(executor as never, 7);

    const emails = recorded.ticketUpdates.map((u) => u.attendeeEmail);
    expect(emails).toEqual([
      "eliminado+11@perfil-eliminado.invalid",
      "eliminado+12@perfil-eliminado.invalid",
    ]);
    expect(new Set(emails).size).toBe(emails.length);
  });
});
