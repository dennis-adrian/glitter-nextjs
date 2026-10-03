// @vitest-environment node

import { eq, inArray } from "drizzle-orm";
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
  festivalDates,
  festivalSectors,
  festivalStatusEvents,
  festivals,
  profileSubcategories,
  stands,
  subcategories,
  tickets,
  users,
  visitors,
} from "@/db/schema";

const requireAdminOrFestivalAdmin = vi.hoisted(() => vi.fn());
const sendBatchEmails = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/lib/users/helpers", () => ({ requireAdminOrFestivalAdmin }));
vi.mock("@/app/vendors/resend", () => ({ sendBatchEmails }));

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

type Actions = typeof import("@/app/lib/festivals/actions");
type Invitations = typeof import("@/app/lib/festivals/invitations");
let actions: Actions;
let invitations: Invitations;

// A real row: status transitions record their actor through a foreign key.
let ADMIN: { id: number; role: "admin" };
const RUN_ID = "6f0c6c1e-8f64-4a8e-9a54-3b1f0c3f2a11";

const created = {
  festivals: [] as number[],
  visitors: [] as number[],
  users: [] as number[],
  subcategories: [] as number[],
};

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function createFestival(
  values: Partial<typeof festivals.$inferInsert> = {},
) {
  const db = integrationDb!;
  const [festival] = await db
    .insert(festivals)
    .values({
      name: `Invitations ${suffix()}`,
      status: "active",
      festivalType: "glitter",
      ...values,
    })
    .returning();
  created.festivals.push(festival!.id);
  await db.insert(festivalDates).values({
    festivalId: festival!.id,
    startDate: new Date("2026-10-24T14:00:00Z"),
    endDate: new Date("2026-10-24T22:00:00Z"),
  });
  return festival!;
}

async function createVisitors(tag: string, emails: string[]) {
  const rows = await integrationDb!
    .insert(visitors)
    .values(
      emails.map((email, index) => ({
        firstName: `V${index}`,
        email,
        phoneNumber: `7${index}${tag.slice(-6)}`,
        birthdate: new Date("2000-01-01"),
      })),
    )
    .returning();
  created.visitors.push(...rows.map((row) => row.id));
  return rows;
}

/** Every recipient Resend was handed, across every batch call. */
function mailedTo() {
  return sendBatchEmails.mock.calls.flatMap(([emails]) =>
    (emails as { to: string[] }[]).flatMap((email) => email.to),
  );
}

async function sendAll(festivalId: number, kind: "visitor_registration" | "participant_activation") {
  let cursor: number | null = 0;
  let sent = 0;
  let skipped = 0;
  while (cursor !== null) {
    const result = await invitations.sendInvitationBatch({
      festivalId,
      kind,
      runId: RUN_ID,
      cursor,
    });
    if (!result.success) throw new Error(result.message);
    sent += result.sent;
    skipped += result.skipped;
    cursor = result.nextCursor;
  }
  return { sent, skipped };
}

describeDatabase("festival registration and invitation actions", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    actions = await import("@/app/lib/festivals/actions");
    invitations = await import("@/app/lib/festivals/invitations");

    const result = await pool!.query<{ festivals: string | null }>(
      "select to_regclass('public.festivals')::text as festivals",
    );
    if (!result.rows[0]?.festivals) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }

    const tag = suffix();
    const [admin] = await integrationDb!
      .insert(users)
      .values({
        clerkId: `clerk-admin-${tag}`,
        email: `admin-${tag}@example.test`,
        role: "admin",
        status: "verified",
      })
      .returning();
    ADMIN = { id: admin!.id, role: "admin" };
  }, 60_000);

  afterEach(async () => {
    requireAdminOrFestivalAdmin.mockReset();
    sendBatchEmails.mockReset();
    const db = integrationDb!;
    const festivalIds = created.festivals.splice(0);
    if (festivalIds.length > 0) {
      await db.delete(tickets).where(inArray(tickets.festivalId, festivalIds));
      await db
        .delete(festivalStatusEvents)
        .where(inArray(festivalStatusEvents.festivalId, festivalIds));
      await db.delete(stands).where(inArray(stands.festivalId, festivalIds));
      await db.delete(festivals).where(inArray(festivals.id, festivalIds));
    }
    const visitorIds = created.visitors.splice(0);
    if (visitorIds.length > 0) {
      await db.delete(visitors).where(inArray(visitors.id, visitorIds));
    }
    const userIds = created.users.splice(0);
    if (userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, userIds));
    }
    const subcategoryIds = created.subcategories.splice(0);
    if (subcategoryIds.length > 0) {
      await db
        .delete(subcategories)
        .where(inArray(subcategories.id, subcategoryIds));
    }
  });

  afterAll(async () => {
    if (ADMIN) {
      await integrationDb!.delete(users).where(eq(users.id, ADMIN.id));
    }
    await pool?.end();
  });

  describe("updateFestivalRegistration", () => {
    it("refuses unauthenticated callers and changes nothing", async () => {
      const festival = await createFestival();
      requireAdminOrFestivalAdmin.mockResolvedValue(null);

      const result = await actions.updateFestivalRegistration(festival.id, true);

      expect(result).toEqual({ success: false, message: "No autorizado" });
      const row = await integrationDb!.query.festivals.findFirst({
        where: eq(festivals.id, festival.id),
      });
      expect(row?.publicRegistration).toBe(false);
      expect(sendBatchEmails).not.toHaveBeenCalled();
    });

    it("only opens on an active festival, and never mails by itself", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);
      const draft = await createFestival({ status: "draft" });
      const active = await createFestival();

      expect(
        await actions.updateFestivalRegistration(draft.id, true),
      ).toMatchObject({ success: false });
      expect(
        await actions.updateFestivalRegistration(active.id, true),
      ).toMatchObject({ success: true, changed: true });
      expect(sendBatchEmails).not.toHaveBeenCalled();
    });

    it("reports an unchanged state so the dialog does not mail twice", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);
      const festival = await createFestival({ publicRegistration: true });

      expect(
        await actions.updateFestivalRegistration(festival.id, true),
      ).toMatchObject({ success: true, changed: false });
    });

    it("closes registro en puerta with it", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);
      const festival = await createFestival({
        publicRegistration: true,
        eventDayRegistration: true,
      });

      await actions.updateFestivalRegistration(festival.id, false);

      const row = await integrationDb!.query.festivals.findFirst({
        where: eq(festivals.id, festival.id),
      });
      expect(row).toMatchObject({
        publicRegistration: false,
        eventDayRegistration: false,
      });
    });
  });

  describe("updateFestivalEventDayRegistration", () => {
    it("needs acreditación open, and writes only its own flag", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);
      const closed = await createFestival();
      const open = await createFestival({
        publicRegistration: true,
        description: "original",
      });

      expect(
        await actions.updateFestivalEventDayRegistration(closed.id, true),
      ).toMatchObject({ success: false });
      expect(
        await actions.updateFestivalEventDayRegistration(open.id, true),
      ).toMatchObject({ success: true });

      const row = await integrationDb!.query.festivals.findFirst({
        where: eq(festivals.id, open.id),
      });
      expect(row).toMatchObject({
        eventDayRegistration: true,
        publicRegistration: true,
        description: "original",
      });
    });
  });

  describe("setFestivalActive", () => {
    it("deactivating returns to draft and closes registration", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);
      const festival = await createFestival({
        publicRegistration: true,
        eventDayRegistration: true,
      });

      const result = await actions.setFestivalActive(festival.id, false);

      expect(result).toMatchObject({ success: true, changed: true });
      const row = await integrationDb!.query.festivals.findFirst({
        where: eq(festivals.id, festival.id),
      });
      expect(row).toMatchObject({
        status: "draft",
        publicRegistration: false,
        eventDayRegistration: false,
      });
    });

    it("refuses an archived festival", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);
      const festival = await createFestival({ status: "archived" });

      expect(await actions.setFestivalActive(festival.id, true)).toMatchObject({
        success: false,
      });
    });
  });

  describe("visitor invitations", () => {
    it("reaches every visitor without a ticket here, once, and nobody else", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);
      sendBatchEmails.mockResolvedValue({ data: { data: [] }, error: null });
      const tag = suffix();
      const festival = await createFestival({ publicRegistration: true });
      const other = await createFestival();
      const [registered, otherFestivalOnly, invited, invalid] =
        await createVisitors(tag, [
          `registered-${tag}@example.test`,
          `other-${tag}@example.test`,
          `invited-${tag}@example.test`,
          `invalid ${tag}@example.test`,
        ]);
      await integrationDb!.insert(tickets).values([
        { date: new Date(), visitorId: registered!.id, festivalId: festival.id },
        {
          date: new Date(),
          visitorId: otherFestivalOnly!.id,
          festivalId: other.id,
        },
      ]);

      const audience = await invitations.fetchInvitationAudience(
        festival.id,
        "visitor_registration",
      );
      expect(audience.success).toBe(true);

      await sendAll(festival.id, "visitor_registration");

      const mine = mailedTo().filter((email) => email.includes(tag));
      expect(mine.sort()).toEqual(
        [otherFestivalOnly!.email, invited!.email].sort(),
      );
      expect(mine).not.toContain(invalid!.email);

      // Each page carries a key scoped to this run.
      for (const [, options] of sendBatchEmails.mock.calls) {
        expect(options.idempotencyKey).toContain(
          `/visitor_registration/${festival.id}/${RUN_ID}/`,
        );
      }
    });

    it("refuses to mail while acreditación is closed or without permission", async () => {
      const festival = await createFestival();

      requireAdminOrFestivalAdmin.mockResolvedValue(null);
      expect(
        await invitations.sendInvitationBatch({
          festivalId: festival.id,
          kind: "visitor_registration",
          runId: RUN_ID,
          cursor: 0,
        }),
      ).toEqual({ success: false, message: "No autorizado" });

      requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);
      expect(
        await invitations.sendInvitationBatch({
          festivalId: festival.id,
          kind: "visitor_registration",
          runId: RUN_ID,
          cursor: 0,
        }),
      ).toMatchObject({ success: false });
      expect(sendBatchEmails).not.toHaveBeenCalled();
    });

    it("reports a page Resend refused with the cursor to retry it", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);
      sendBatchEmails.mockResolvedValue({
        data: null,
        error: { name: "rate_limit_exceeded", message: "Too many requests" },
      });
      const tag = suffix();
      const festival = await createFestival({ publicRegistration: true });
      await createVisitors(tag, [`only-${tag}@example.test`]);

      const result = await invitations.sendInvitationBatch({
        festivalId: festival.id,
        kind: "visitor_registration",
        runId: RUN_ID,
        cursor: 0,
        maxPages: 1,
      });

      expect(result).toMatchObject({ success: true, sent: 0 });
      if (!result.success) throw new Error("unreachable");
      expect(result.failed).toBeGreaterThan(0);
      expect(result.failures[0]).toMatchObject({
        cursor: 0,
        message: "Too many requests",
      });
    });
  });

  describe("participant invitations", () => {
    it("mails verified participants of the festival's categories who can open the terms", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);
      sendBatchEmails.mockResolvedValue({ data: { data: [] }, error: null });
      const db = integrationDb!;
      const tag = suffix();
      const festival = await createFestival();
      const [sector] = await db
        .insert(festivalSectors)
        .values({ name: `Sector ${tag}`, festivalId: festival.id })
        .returning();
      await db.insert(stands).values({
        standNumber: 1,
        standCategory: "illustration",
        festivalId: festival.id,
        festivalSectorId: sector!.id,
      });
      const [subcategory] = await db
        .insert(subcategories)
        .values({ label: `Sub ${tag}`, category: "illustration" })
        .returning();
      created.subcategories.push(subcategory!.id);

      const makeUser = async (
        name: string,
        values: Partial<typeof users.$inferInsert>,
        withSubcategory: boolean,
      ) => {
        const [user] = await db
          .insert(users)
          .values({
            clerkId: `clerk-${name}-${tag}`,
            email: `${name}-${tag}@example.test`,
            status: "verified",
            category: "illustration",
            ...values,
          })
          .returning();
        created.users.push(user!.id);
        if (withSubcategory) {
          await db.insert(profileSubcategories).values({
            profileId: user!.id,
            subcategoryId: subcategory!.id,
          });
        }
        return user!;
      };

      const invited = await makeUser("invited", {}, true);
      await makeUser("nosubcategory", {}, false);
      await makeUser("pending", { status: "pending" }, true);
      await makeUser("gastronomy", { category: "gastronomy" }, true);

      await sendAll(festival.id, "participant_activation");

      expect(mailedTo().filter((email) => email.includes(tag))).toEqual([
        invited.email,
      ]);
    });
  });

  describe("deleteFestival", () => {
    it("deletes a festival that never changed status", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);
      const festival = await createFestival({ status: "draft" });
      await integrationDb!.insert(festivalStatusEvents).values({
        festivalId: festival.id,
        fromStatus: null,
        toStatus: "draft",
      });

      const result = await actions.deleteFestival(festival.id);

      expect(result).toMatchObject({ success: true });
      const row = await integrationDb!.query.festivals.findFirst({
        where: eq(festivals.id, festival.id),
      });
      expect(row).toBeUndefined();
    });

    it("archives a festival with status history instead of failing", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(ADMIN);
      const festival = await createFestival();
      await integrationDb!.insert(festivalStatusEvents).values([
        { festivalId: festival.id, fromStatus: null, toStatus: "draft" },
        { festivalId: festival.id, fromStatus: "draft", toStatus: "active" },
      ]);

      const result = await actions.deleteFestival(festival.id);

      expect(result).toMatchObject({ success: true });
      const row = await integrationDb!.query.festivals.findFirst({
        where: eq(festivals.id, festival.id),
      });
      expect(row?.status).toBe("archived");
      const history = await integrationDb!.query.festivalStatusEvents.findMany({
        where: eq(festivalStatusEvents.festivalId, festival.id),
      });
      expect(history.length).toBeGreaterThanOrEqual(2);
    });
  });
});
