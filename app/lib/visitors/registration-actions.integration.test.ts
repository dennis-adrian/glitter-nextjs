// @vitest-environment node

import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { DateTime } from "luxon";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as schema from "@/db/schema";
import { festivalDates, festivals, tickets, visitors } from "@/db/schema";

/**
 * The public registration actions against a real database, with the
 * browser's cookie jar and network address simulated.
 */

const cookieJar = vi.hoisted(() => new Map<string, string>());
const requestIp = vi.hoisted(() => ({ value: "203.0.113.1" }));
const afterQueue = vi.hoisted(() => [] as (() => unknown)[]);
const sendEmail = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({
  after: (task: () => unknown) => afterQueue.push(task),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": requestIp.value }),
}));
vi.mock("@/app/vendors/resend", () => ({ sendEmail }));

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

type Actions = typeof import("@/app/lib/visitors/registration-actions");
let actions: Actions;

const created = { festivals: [] as number[], emails: [] as string[] };

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 10:00 in La Paz, `days` from today in La Paz. */
function festivalDay(days: number) {
  return DateTime.now()
    .setZone("America/La_Paz")
    .startOf("day")
    .plus({ days, hours: 10 })
    .toJSDate();
}

async function createFestival(
  values: Partial<typeof festivals.$inferInsert> = {},
  dayOffsets = [0, 1],
) {
  const db = integrationDb!;
  const [festival] = await db
    .insert(festivals)
    .values({
      name: `Registration ${suffix()}`,
      status: "active",
      festivalType: "glitter",
      festivalCode: "TST",
      publicRegistration: true,
      eventDayRegistration: false,
      ...values,
    })
    .returning();
  created.festivals.push(festival!.id);
  await db.insert(festivalDates).values(
    dayOffsets.map((days) => ({
      festivalId: festival!.id,
      startDate: festivalDay(days),
      endDate: new Date(festivalDay(days).getTime() + 8 * 60 * 60 * 1000),
    })),
  );
  return festival!;
}

async function createVisitor(email: string) {
  created.emails.push(email.trim().toLowerCase());
  const [visitor] = await integrationDb!
    .insert(visitors)
    .values({
      email,
      firstName: "Ana",
      lastName: "Pérez",
      phoneNumber: "+59171234567",
      birthdate: new Date("2000-01-01T12:00:00Z"),
      gender: "female",
    })
    .returning();
  return visitor!;
}

function uniqueEmail(label: string) {
  const email = `${label}-${suffix()}@example.test`;
  created.emails.push(email);
  return email;
}

async function runAfterTasks() {
  while (afterQueue.length > 0) await afterQueue.shift()!();
}

const newVisitorDetails = {
  firstName: "Camila",
  lastName: "Rojas",
  birthdate: "1998-03-02",
  phoneNumber: "+59171234567",
  gender: "female" as const,
};

describeDatabase("visitor registration actions", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    actions = await import("@/app/lib/visitors/registration-actions");

    const result = await pool!.query<{ visitors: string | null }>(
      "select to_regclass('public.visitors')::text as visitors",
    );
    if (!result.rows[0]?.visitors) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
  }, 60_000);

  beforeEach(() => {
    cookieJar.clear();
    afterQueue.length = 0;
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ data: { id: "email" }, error: null });
    // Each test its own address, so rate limits never carry over.
    requestIp.value = `203.0.113.${Math.floor(Math.random() * 250) + 1}-${suffix()}`;
  });

  afterEach(async () => {
    const db = integrationDb!;
    const festivalIds = created.festivals.splice(0);
    if (festivalIds.length > 0) {
      await db.delete(tickets).where(inArray(tickets.festivalId, festivalIds));
      await db
        .delete(festivalDates)
        .where(inArray(festivalDates.festivalId, festivalIds));
      await db.delete(festivals).where(inArray(festivals.id, festivalIds));
    }
    const emails = created.emails.splice(0);
    if (emails.length > 0) {
      await db
        .delete(visitors)
        .where(inArray(sql`lower(trim(${visitors.email}))`, emails));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("recognises a returning visitor by email, whatever its case, without sending their details back", async () => {
    const festival = await createFestival();
    const visitor = await createVisitor(`Ana.${suffix()}@Example.test`);

    const result = await actions.startVisitorRegistration({
      festivalId: festival.id,
      email: `  ${visitor.email.toUpperCase()} `,
      mode: "online",
    });

    expect(result).toMatchObject({
      success: true,
      status: "returning",
      view: { firstName: "Ana", displayName: "Ana P.", tickets: [] },
    });
    const sent = JSON.stringify(result);
    expect(sent).not.toContain(visitor.email);
    expect(sent).not.toContain(visitor.phoneNumber);
    expect(sent).not.toContain("Pérez");
    expect(cookieJar.has("glitter_visitor")).toBe(true);
  });

  it("registers a new visitor under the email from the first step, then issues their ticket", async () => {
    const festival = await createFestival();
    const email = uniqueEmail("New");

    const start = await actions.startVisitorRegistration({
      festivalId: festival.id,
      email,
      mode: "online",
    });
    expect(start).toEqual({ success: true, status: "new" });
    expect(cookieJar.has("glitter_visitor")).toBe(false);

    const registered = await actions.registerVisitor({
      festivalId: festival.id,
      mode: "online",
      details: newVisitorDetails,
    });
    expect(registered).toMatchObject({
      success: true,
      view: { displayName: "Camila R.", tickets: [] },
    });

    const [stored] = await integrationDb!
      .select()
      .from(visitors)
      .where(eq(visitors.email, email.toLowerCase()));
    expect(stored).toMatchObject({
      firstName: "Camila",
      lastName: "Rojas",
      phoneNumber: "+59171234567",
    });
    expect(stored!.birthdate.toISOString()).toBe("1998-03-02T12:00:00.000Z");

    const tomorrow = festivalDay(1);
    const claimed = await actions.claimTicket({
      festivalId: festival.id,
      date: tomorrow.toISOString(),
    });
    expect(claimed).toMatchObject({ success: true });
    if (!claimed.success) throw new Error(claimed.message);
    expect(claimed.view.tickets).toHaveLength(1);
    expect(claimed.view.tickets[0]).toMatchObject({
      date: tomorrow,
      numberOfVisitors: 1,
      isEventDayCreation: false,
    });
    expect(claimed.view.tickets[0]!.code).toMatch(/^TST-\d{4}$/);

    await runAfterTasks();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [mail] = sendEmail.mock.calls[0]!;
    expect(mail.to).toEqual([email.toLowerCase()]);
  });

  it("does not let the details step pick or overwrite someone else's record", async () => {
    const festival = await createFestival();
    const victim = await createVisitor(uniqueEmail("victim"));

    // No email step: nothing to register under.
    expect(
      await actions.registerVisitor({
        festivalId: festival.id,
        mode: "online",
        details: newVisitorDetails,
      }),
    ).toMatchObject({ success: false, restart: true });

    // An email that is someone's already: signs in, leaves them as they were.
    await actions.startVisitorRegistration({
      festivalId: festival.id,
      email: uniqueEmail("attacker"),
      mode: "online",
    });
    cookieJar.set(
      "glitter_visitor_email",
      (
        await import("@/app/lib/visitors/access-tokens")
      ).signVisitorToken({
        purpose: "pending-email",
        subject: victim.email,
        ttlMs: 60_000,
      }),
    );
    await actions.registerVisitor({
      festivalId: festival.id,
      mode: "online",
      details: newVisitorDetails,
    });
    const [unchanged] = await integrationDb!
      .select()
      .from(visitors)
      .where(eq(visitors.id, victim.id));
    expect(unchanged).toMatchObject({ firstName: "Ana", lastName: "Pérez" });
  });

  it("ignores a forged session cookie", async () => {
    const festival = await createFestival();
    const visitor = await createVisitor(uniqueEmail("forged"));
    cookieJar.set(
      "glitter_visitor",
      `${Buffer.from(
        JSON.stringify({ p: "session", s: visitor.id, x: Date.now() + 60_000 }),
      ).toString("base64url")}.AAAA`,
    );

    expect(
      await actions.claimTicket({
        festivalId: festival.id,
        date: festivalDay(1).toISOString(),
      }),
    ).toMatchObject({ success: false, restart: true });
  });

  it("only books one of the festival's remaining days online", async () => {
    const festival = await createFestival({}, [-1, 1]);
    const visitor = await createVisitor(uniqueEmail("dates"));
    await actions.startVisitorRegistration({
      festivalId: festival.id,
      email: visitor.email,
      mode: "online",
    });

    for (const date of [
      festivalDay(-1),
      festivalDay(5),
      new Date(festivalDay(1).getTime() + 60_000),
    ]) {
      expect(
        await actions.claimTicket({
          festivalId: festival.id,
          date: date.toISOString(),
        }),
      ).toMatchObject({ success: false });
    }
    expect(
      await actions.claimTicket({ festivalId: festival.id, date: "nope" }),
    ).toMatchObject({ success: false });

    const rows = await integrationDb!
      .select()
      .from(tickets)
      .where(eq(tickets.visitorId, visitor.id));
    expect(rows).toHaveLength(0);
  });

  it("refuses everything while acreditación is closed", async () => {
    const festival = await createFestival({ publicRegistration: false });
    const visitor = await createVisitor(uniqueEmail("closed"));
    expect(
      await actions.startVisitorRegistration({
        festivalId: festival.id,
        email: visitor.email,
        mode: "online",
      }),
    ).toMatchObject({ success: false });
    expect(cookieJar.size).toBe(0);
  });

  describe("registro en puerta", () => {
    it("stays closed while its switch is off, even on a festival day", async () => {
      const festival = await createFestival({ eventDayRegistration: false });
      const visitor = await createVisitor(uniqueEmail("door-off"));
      expect(
        await actions.startVisitorRegistration({
          festivalId: festival.id,
          email: visitor.email,
          mode: "door",
        }),
      ).toMatchObject({ success: false });
    });

    it("stays closed on a day without festival", async () => {
      const festival = await createFestival({ eventDayRegistration: true }, [
        1, 2,
      ]);
      const visitor = await createVisitor(uniqueEmail("door-early"));
      await actions.startVisitorRegistration({
        festivalId: festival.id,
        email: visitor.email,
        mode: "online",
      });
      expect(
        await actions.claimDoorTicket({
          festivalId: festival.id,
          numberOfVisitors: 1,
        }),
      ).toMatchObject({ success: false });
    });

    it("issues today's ticket for the whole party, once", async () => {
      const festival = await createFestival({ eventDayRegistration: true });
      const visitor = await createVisitor(uniqueEmail("door"));
      await actions.startVisitorRegistration({
        festivalId: festival.id,
        email: visitor.email,
        mode: "door",
      });

      expect(
        await actions.claimDoorTicket({
          festivalId: festival.id,
          numberOfVisitors: 11,
        }),
      ).toMatchObject({ success: false });

      const first = await actions.claimDoorTicket({
        festivalId: festival.id,
        numberOfVisitors: 3,
      });
      expect(first).toMatchObject({ success: true });
      const again = await actions.claimDoorTicket({
        festivalId: festival.id,
        numberOfVisitors: 3,
      });
      expect(again).toMatchObject({
        success: true,
        message: "Ya tenías una entrada para este día",
      });

      const rows = await integrationDb!
        .select()
        .from(tickets)
        .where(eq(tickets.visitorId, visitor.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        date: festivalDay(0),
        numberOfVisitors: 3,
        isEventDayCreation: true,
      });
    });
  });

  describe("ticket history link", () => {
    it("mails a signed link to the stored address only, and answers the same for unknown emails", async () => {
      const visitor = await createVisitor(uniqueEmail("history"));

      const known = await actions.requestTicketHistoryLink({
        email: visitor.email.toUpperCase(),
      });
      const unknown = await actions.requestTicketHistoryLink({
        email: uniqueEmail("nobody"),
      });
      expect(unknown).toEqual(known);

      await runAfterTasks();
      expect(sendEmail).toHaveBeenCalledTimes(1);
      const [mail] = sendEmail.mock.calls[0]!;
      expect(mail.to).toEqual([visitor.email]);

      const { visitorIdFromHistoryToken } = await import(
        "@/app/lib/visitors/session"
      );
      const html = JSON.stringify(mail.react);
      const token = decodeURIComponent(
        /access\?token=([^"\\&]+)/.exec(html)![1]!,
      );
      expect(visitorIdFromHistoryToken(token)).toBe(visitor.id);
    });

    it("slows down repeated requests for one address", async () => {
      const visitor = await createVisitor(uniqueEmail("flood"));
      const results = [];
      for (let attempt = 0; attempt < 4; attempt += 1) {
        requestIp.value = `198.51.100.${attempt}-${suffix()}`;
        results.push(
          await actions.requestTicketHistoryLink({ email: visitor.email }),
        );
      }
      expect(results.slice(0, 3).every((result) => result.success)).toBe(true);
      expect(results[3]).toMatchObject({ success: false });
    });
  });
});
