// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const insertedValues = vi.fn();
  const tx = {
    execute: vi.fn(async () => undefined),
    select: vi.fn((columns?: unknown) => ({
      from: () => ({
        // The first read asks for an existing ticket, the second for the
        // highest number; only the second names its columns.
        where: async () => (columns ? [{ highest: 4 }] : []),
      }),
    })),
    insert: vi.fn(() => ({
      values: (values: Record<string, unknown>) => {
        insertedValues(values);
        return {
          returning: async () => [
            { id: 50, status: "pending", ...values, ticketNumber: 5 },
          ],
        };
      },
    })),
  };
  return {
    insertedValues,
    tx,
    findVisitor: vi.fn<(query: unknown) => Promise<unknown>>(),
    findFestival: vi.fn(),
    transaction: vi.fn(async (run: (t: typeof tx) => unknown) => run(tx)),
    sendEmail: vi.fn(),
    ticketTemplate: vi.fn<(props: unknown) => null>(() => null),
    /** Work `createTicket` handed to `after`, run once the response is out. */
    afterCallbacks: [] as Array<() => unknown>,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({
  after: (callback: () => unknown) => {
    mocks.afterCallbacks.push(callback);
  },
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentBaseProfile: vi.fn(async () => null),
  requireAdminOrFestivalAdmin: vi.fn(async () => null),
}));
vi.mock("@/app/lib/tickets/creation-rate-limit", () => ({
  consumeTicketCreationRateLimit: vi.fn(async () => true),
}));
vi.mock("@/app/vendors/resend", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/app/emails/ticket", () => ({ default: mocks.ticketTemplate }));
vi.mock("@/app/lib/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/utils")>()),
  generateQrBuffer: vi.fn(async () => Buffer.from("")),
}));
vi.mock("@/db", () => ({
  db: {
    query: {
      visitors: { findFirst: mocks.findVisitor },
      festivals: { findFirst: mocks.findFestival },
    },
    transaction: mocks.transaction,
  },
}));

import { createTicket } from "@/app/data/tickets/actions";

const festivalDay = new Date("2026-11-01T14:00:00.000Z");
const storedVisitor = {
  id: 7,
  firstName: "Ana",
  lastName: "Rojas",
  email: "ana@example.com",
};
const storedFestival = {
  id: 1,
  name: "Glitter",
  festivalCode: "GL",
  festivalDates: [{ startDate: festivalDay }],
};

/** Runs what `after` deferred, as Next does once the response is sent. */
async function runAfterResponse() {
  await Promise.all(
    mocks.afterCallbacks.splice(0).map((callback) => callback()),
  );
}

describe("createTicket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks.length = 0;
    mocks.findVisitor.mockResolvedValue(storedVisitor);
    mocks.findFestival.mockResolvedValue(storedFestival);
    mocks.sendEmail.mockResolvedValue({
      data: { id: "email-1" },
      error: null,
      headers: null,
    });
  });

  it("mails the stored visitor about the stored festival, whatever the caller sends", async () => {
    const result = await createTicket({
      date: festivalDay,
      email: "ana@example.com",
      festivalId: 1,
      // What the action used to trust: a caller-chosen recipient and content.
      visitor: { id: 7, email: "victim@example.com" },
      festival: { id: 1, name: "Premio", mascotUrl: "https://evil.example" },
    } as Parameters<typeof createTicket>[0]);

    expect(result).toMatchObject({ success: true });
    await runAfterResponse();
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0]).toMatchObject({
      to: ["ana@example.com"],
      subject: expect.stringContaining("Glitter"),
    });
    expect(mocks.ticketTemplate.mock.calls[0][0]).toMatchObject({
      visitor: storedVisitor,
      festival: storedFestival,
    });
  });

  it("refuses a day the festival does not run", async () => {
    const result = await createTicket({
      date: new Date("2026-12-24T14:00:00.000Z"),
      email: "ana@example.com",
      festivalId: 1,
    });

    expect(result).toMatchObject({ success: false, ticket: null });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("refuses a visitor or festival that does not exist", async () => {
    mocks.findVisitor.mockResolvedValue(undefined);

    const result = await createTicket({
      date: festivalDay,
      email: "nadie@example.com",
      festivalId: 1,
    });

    expect(result).toMatchObject({ success: false, ticket: null });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("finds the visitor by the address typed, never by an id", async () => {
    await createTicket({
      date: festivalDay,
      email: "ana@example.com",
      festivalId: 1,
      // What the action used to take: a sequential id anyone could iterate.
      visitorId: 8,
    } as Parameters<typeof createTicket>[0]);

    expect(mocks.findVisitor).toHaveBeenCalledTimes(1);
    const { where } = mocks.findVisitor.mock.calls[0][0] as {
      where: { queryChunks: unknown[] };
    };
    const params = where.queryChunks.filter(
      (chunk): chunk is { value: unknown } =>
        typeof chunk === "object" &&
        chunk !== null &&
        "value" in chunk &&
        !Array.isArray((chunk as { value: unknown }).value),
    );
    expect(params.map((chunk) => chunk.value)).toEqual(["ana@example.com"]);
    expect(mocks.insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({ visitorId: 7 }),
    );
  });

  it.each([
    ["no address", undefined],
    ["an empty address", ""],
    ["an address no mailbox can have", `${"a".repeat(320)}@example.com`],
    ["a number in place of the address", 7],
  ])("looks nobody up for %s", async (_, email) => {
    const result = await createTicket({
      date: festivalDay,
      email,
      festivalId: 1,
    } as Parameters<typeof createTicket>[0]);

    expect(result).toMatchObject({ success: false, ticket: null });
    expect(mocks.findVisitor).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("admits at most ten people on one ticket", async () => {
    await createTicket({
      date: festivalDay,
      email: "ana@example.com",
      festivalId: 1,
      numberOfVisitors: 500,
    });

    expect(mocks.insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({ numberOfVisitors: 10, visitorId: 7 }),
    );
  });
});
