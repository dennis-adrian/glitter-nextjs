// @vitest-environment node

import { eq, inArray, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as schema from "@/db/schema";
import {
  programSessions,
  sessionOccurrences,
  sessionPurchaseLines,
  sessionPurchases,
  sessionTickets,
  users,
} from "@/db/schema";

/**
 * The day-of reminder against a real database: which address each ticket's
 * reminder goes to. The send itself is faked; the query is what is under test.
 */

vi.mock("server-only", () => ({}));

const sendReminderMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/programs/notifications", () => ({
  sendSessionDayReminderEmail: sendReminderMock,
}));
// The real one waits a second per ten recipients.
vi.mock("@/app/lib/emails/helpers", () => ({
  queueEmails: async <T>(items: T[], send: (item: T) => Promise<void>) => {
    for (const item of items) await send(item);
  },
}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string): boolean {
  try {
    const databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
    return /(^|[_-])(test|ci)([_-]|$)/i.test(databaseName);
  } catch {
    return false;
  }
}

if (testDatabaseUrl && !isSafeTestDatabase(testDatabaseUrl)) {
  throw new Error(
    "TEST_DATABASE_URL must target a database whose name contains 'test' or 'ci'.",
  );
}

const pool = testDatabaseUrl
  ? new Pool({ connectionString: testDatabaseUrl })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type ScheduledActions = typeof import("@/app/lib/programs/scheduled-actions");
type AppDb = typeof import("@/db");
let scheduledActions: ScheduledActions;
let app: AppDb;

/** On every address, Clerk id and key a test makes, for cleanup. */
const MARK = `reminder-it-${Math.random().toString(36).slice(2, 10)}`;
const PATTERN = `%${MARK}%`;
const created = { users: [] as number[] };

// A day nothing else in the suites schedules; 10:00 in La Paz.
const TODAY = new Date("2033-03-10T14:00:00Z");

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function address(label: string) {
  return `${label}-${MARK}-${suffix()}@example.test`;
}

function key(label: string) {
  return `${label}-${MARK}-${suffix()}`;
}

async function makeUser(label: string, email = address(label)) {
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: key(`clerk-${label}`),
      email,
      displayName: `Persona ${label}`,
    })
    .returning();
  created.users.push(user.id);
  return user;
}

async function makeOccurrence(title: string, startsAt: Date) {
  const db = integrationDb!;
  const [session] = await db
    .insert(programSessions)
    .values({ slug: key("charla"), title, type: "talk" })
    .returning({ id: programSessions.id });
  const [occurrence] = await db
    .insert(sessionOccurrences)
    .values({
      sessionId: session.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
    })
    .returning({ id: sessionOccurrences.id });
  return { sessionId: session.id, occurrenceId: occurrence.id, startsAt };
}

async function makeTicket(input: {
  occurrence: Awaited<ReturnType<typeof makeOccurrence>>;
  userId: number | null;
  email: string;
}) {
  const db = integrationDb!;
  const now = new Date();
  const [purchase] = await db
    .insert(sessionPurchases)
    .values({
      ...(input.userId
        ? { userId: input.userId }
        : {
            guestName: "Invitada",
            guestEmail: input.email,
            guestPhone: "70000000",
          }),
      accessTokenHash: key("token"),
      paymentMode: "free",
      buyerEligibility: "public",
      eligibilityEvaluatedAt: now,
      eligibilitySnapshot: {},
      subtotalAmount: 0,
      totalAmount: 0,
      noRefundPolicyVersion: "v1",
      noRefundPolicyAcceptedAt: now,
      idempotencyKey: key("purchase"),
    })
    .returning({ id: sessionPurchases.id });
  const [line] = await db
    .insert(sessionPurchaseLines)
    .values({
      purchaseId: purchase.id,
      occurrenceId: input.occurrence.occurrenceId,
      sessionId: input.occurrence.sessionId,
      unitPrice: 0,
      basePrice: 0,
      existingPrice: 0,
      discountAmount: 0,
      priceBasis: "public",
      pricingSnapshot: {},
      sessionTitleSnapshot: "Charla",
      occurrenceStartsAtSnapshot: input.occurrence.startsAt,
    })
    .returning({ id: sessionPurchaseLines.id });
  const [ticket] = await db
    .insert(sessionTickets)
    .values({
      purchaseLineId: line.id,
      occurrenceId: input.occurrence.occurrenceId,
      code: key("qr"),
      attendeeUserId: input.userId,
      attendeeName: "Asistente",
      attendeeEmail: input.email,
    })
    .returning({ id: sessionTickets.id });
  return ticket.id;
}

/** This file's reminders: the database may hold other suites' tickets. */
function remindersSent() {
  return sendReminderMock.mock.calls
    .map(
      ([input]) =>
        input as {
          attendeeEmail: string;
          hasAccount: boolean;
          lines: { sessionTitle: string }[];
        },
    )
    .filter((input) => input.attendeeEmail.includes(MARK))
    .map((input) => ({
      to: input.attendeeEmail,
      hasAccount: input.hasAccount,
      sessions: input.lines.map((line) => line.sessionTitle),
    }));
}

describeDatabase("the day-of session reminder", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    scheduledActions = await import("@/app/lib/programs/scheduled-actions");
    app = await import("@/db");

    const result = await pool!.query<{ table: string | null }>(
      "select to_regclass('public.session_tickets')::text as table",
    );
    if (!result.rows[0]?.table) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
  }, 60_000);

  afterEach(async () => {
    sendReminderMock.mockReset();
    const db = integrationDb!;
    // Purchases take their lines and tickets with them, and have to go
    // before the occurrences and the users they hold on to.
    await db
      .delete(sessionPurchases)
      .where(like(sessionPurchases.idempotencyKey, PATTERN));
    await db.delete(programSessions).where(like(programSessions.slug, PATTERN));
    const userIds = created.users.splice(0);
    await db
      .delete(users)
      .where(
        or(
          like(users.clerkId, PATTERN),
          userIds.length > 0 ? inArray(users.id, userIds) : undefined,
        ),
      );
  });

  afterAll(async () => {
    await app?.pool.end();
    await pool?.end();
  });

  it("writes to the account's current address, not the one the ticket kept", async () => {
    sendReminderMock.mockResolvedValue(true);
    const charla = await makeOccurrence("Charla", TODAY);
    const user = await makeUser("ana");
    // As an email change leaves it when the ticket could not follow.
    const stale = address("ana-vieja");
    await makeTicket({ occurrence: charla, userId: user.id, email: stale });

    await scheduledActions.sendSessionDayReminders(TODAY);

    expect(remindersSent()).toEqual([
      { to: user.email, hasAccount: true, sessions: ["Charla"] },
    ]);
  });

  it("follows the profile when its address changes after the ticket was issued", async () => {
    sendReminderMock.mockResolvedValue(true);
    const charla = await makeOccurrence("Charla", TODAY);
    const user = await makeUser("ana");
    await makeTicket({
      occurrence: charla,
      userId: user.id,
      email: user.email,
    });
    const moved = address("ana-nueva");
    await integrationDb!
      .update(users)
      .set({ email: moved })
      .where(eq(users.id, user.id));

    await scheduledActions.sendSessionDayReminders(TODAY);

    expect(remindersSent()).toEqual([
      { to: moved, hasAccount: true, sessions: ["Charla"] },
    ]);
  });

  it("keeps writing to a guest at the address on the ticket", async () => {
    sendReminderMock.mockResolvedValue(true);
    const charla = await makeOccurrence("Charla", TODAY);
    const guest = address("invitada");
    await makeTicket({ occurrence: charla, userId: null, email: guest });

    await scheduledActions.sendSessionDayReminders(TODAY);

    expect(remindersSent()).toEqual([
      { to: guest, hasAccount: false, sessions: ["Charla"] },
    ]);
  });

  it("sends one message for an owned ticket and a guest ticket of the same mailbox", async () => {
    sendReminderMock.mockResolvedValue(true);
    const charla = await makeOccurrence("Charla", TODAY);
    const taller = await makeOccurrence(
      "Taller",
      new Date(TODAY.getTime() + 2 * 3_600_000),
    );
    const user = await makeUser("ana");
    // Bought as a guest with the address the account moved to later.
    await makeTicket({ occurrence: taller, userId: null, email: user.email });
    await makeTicket({
      occurrence: charla,
      userId: user.id,
      email: address("ana-vieja"),
    });

    await scheduledActions.sendSessionDayReminders(TODAY);

    expect(remindersSent()).toEqual([
      { to: user.email, hasAccount: true, sessions: ["Charla", "Taller"] },
    ]);
  });

  it("sends one message for an account whose tickets kept two addresses", async () => {
    sendReminderMock.mockResolvedValue(true);
    const charla = await makeOccurrence("Charla", TODAY);
    const taller = await makeOccurrence(
      "Taller",
      new Date(TODAY.getTime() + 2 * 3_600_000),
    );
    const user = await makeUser("ana");
    // One ticket followed the change, the other could not.
    await makeTicket({
      occurrence: charla,
      userId: user.id,
      email: address("ana-vieja"),
    });
    await makeTicket({
      occurrence: taller,
      userId: user.id,
      email: user.email,
    });

    await scheduledActions.sendSessionDayReminders(TODAY);

    expect(remindersSent()).toEqual([
      { to: user.email, hasAccount: true, sessions: ["Charla", "Taller"] },
    ]);
  });

  it("still skips the scrubbed ticket of a deleted profile", async () => {
    sendReminderMock.mockResolvedValue(true);
    const charla = await makeOccurrence("Charla", TODAY);
    // What anonymization leaves: no account, a placeholder address.
    await makeTicket({
      occurrence: charla,
      userId: null,
      email: `eliminado+1-${MARK}@perfil-eliminado.invalid`,
    });

    await scheduledActions.sendSessionDayReminders(TODAY);

    expect(remindersSent()).toEqual([]);
  });
});
