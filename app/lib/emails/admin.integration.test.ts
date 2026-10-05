// @vitest-environment node

import { eq, inArray, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
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
import {
  emailSuppressions,
  emailUnsubscribes,
  users,
  visitors,
} from "@/db/schema";

/**
 * The blocked-emails admin page against a real database: who may use it,
 * what each action changes here and asks of Resend, and what the list shows.
 */

const requireAdmin = vi.hoisted(() => vi.fn());
const removeResendSuppression = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/lib/users/helpers", () => ({ requireAdmin }));
vi.mock("@/app/vendors/resend", () => ({ removeResendSuppression }));

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

type Actions = typeof import("@/app/lib/emails/admin-actions");
type Queries = typeof import("@/app/lib/emails/admin-queries");
type Suppressions = typeof import("@/app/lib/emails/suppressions");
let actions: Actions;
let queries: Queries;
let suppressions: Suppressions;

const MARK = "admin-it";
const created = { visitors: [] as number[], users: [] as number[] };
let ADMIN: { id: number; role: "admin" };

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function address(label: string) {
  return `${label}-${MARK}-${suffix()}@example.test`;
}

async function suppressionFor(email: string) {
  const [row] = await integrationDb!
    .select()
    .from(emailSuppressions)
    .where(eq(emailSuppressions.emailKey, email.toLowerCase()));
  return row ?? null;
}

async function unsubscribesFor(email: string) {
  return integrationDb!
    .select()
    .from(emailUnsubscribes)
    .where(eq(emailUnsubscribes.emailKey, email.toLowerCase()));
}

function page(
  tab: "blocked" | "unsubscribed" | "lifted",
  query = "",
  limit = 200,
) {
  return queries.fetchEmailAdminPage({ tab, query, limit, offset: 0 });
}

describeDatabase("blocked-emails admin", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    actions = await import("@/app/lib/emails/admin-actions");
    queries = await import("@/app/lib/emails/admin-queries");
    suppressions = await import("@/app/lib/emails/suppressions");

    const result = await pool!.query<{ label: string | null }>(
      "select 1 as label from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'email_topic' and e.enumlabel = 'all'",
    );
    if (result.rowCount === 0) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }

    const [admin] = await integrationDb!
      .insert(users)
      .values({
        clerkId: `clerk-admin-${suffix()}`,
        email: address("the-admin"),
        displayName: "Ana Admin",
        role: "admin",
        status: "verified",
      })
      .returning();
    ADMIN = { id: admin!.id, role: "admin" };
  }, 60_000);

  beforeEach(() => {
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue(ADMIN);
    removeResendSuppression.mockReset();
    removeResendSuppression.mockResolvedValue({ outcome: "removed" });
  });

  afterEach(async () => {
    const db = integrationDb!;
    const pattern = `%-${MARK}-%`;
    await db
      .delete(emailSuppressions)
      .where(like(emailSuppressions.emailKey, pattern));
    await db
      .delete(emailUnsubscribes)
      .where(like(emailUnsubscribes.emailKey, pattern));
    const visitorIds = created.visitors.splice(0);
    if (visitorIds.length > 0) {
      await db.delete(visitors).where(inArray(visitors.id, visitorIds));
    }
    const userIds = created.users.splice(0);
    if (userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, userIds));
    }
  });

  afterAll(async () => {
    if (ADMIN) {
      await integrationDb!.delete(users).where(eq(users.id, ADMIN.id));
    }
    await pool?.end();
  });

  describe("who may use it", () => {
    it("refuses anyone but an admin, and changes nothing", async () => {
      const email = address("guarded");
      await suppressions.recordSuppression({
        address: email,
        reason: "bounce",
      });
      requireAdmin.mockResolvedValue(null);

      expect(
        await queries.fetchEmailAdminPage({
          tab: "blocked",
          query: "",
          limit: 25,
          offset: 0,
        }),
      ).toBeNull();
      expect(await actions.unblockEmail({ emailKey: email })).toEqual({
        success: false,
        message: "No autorizado",
      });
      expect(
        await actions.addUnsubscribe({ email: address("x"), topic: "all" }),
      ).toEqual({ success: false, message: "No autorizado" });
      expect(
        await actions.removeUnsubscribe({ emailKey: email, topic: "all" }),
      ).toEqual({ success: false, message: "No autorizado" });

      expect(await suppressionFor(email)).toMatchObject({ liftedAt: null });
      expect(removeResendSuppression).not.toHaveBeenCalled();
    });
  });

  describe("unblockEmail", () => {
    it("lifts the block here and in Resend, and records who did it", async () => {
      const email = address("unblock");
      await suppressions.recordSuppression({
        address: email,
        reason: "bounce",
      });

      const result = await actions.unblockEmail({
        emailKey: `  ${email.toUpperCase()} `,
      });

      expect(result).toMatchObject({ success: true });
      expect(result.warning).toBeUndefined();
      expect(removeResendSuppression).toHaveBeenCalledWith(email.toLowerCase());
      expect(result.message).not.toContain("Ojo");
      const row = await suppressionFor(email);
      expect(row?.liftedAt).not.toBeNull();
      expect(row?.liftedByUserId).toBe(ADMIN.id);
      expect(await suppressions.isSuppressed(email)).toBe(false);
    });

    it("warns that Resend may block it again when Resend did not lift it", async () => {
      const email = address("resend-refused");
      await suppressions.recordSuppression({
        address: email,
        reason: "complaint",
      });
      removeResendSuppression.mockResolvedValue({
        outcome: "failed",
        message: "Suppressions are not enabled",
      });

      const result = await actions.unblockEmail({ emailKey: email });

      expect(result).toMatchObject({ success: true, warning: true });
      expect(result.message).toContain("Resend → Suppressions");
      expect(await suppressions.isSuppressed(email)).toBe(false);
    });

    it("tells the admin when the person is still unsubscribed", async () => {
      const email = address("still-out");
      await suppressions.recordSuppression({
        address: email,
        reason: "bounce",
      });
      await suppressions.unsubscribe(email, "visitor_invitations");

      const result = await actions.unblockEmail({ emailKey: email });

      expect(result).toMatchObject({ success: true, warning: true });
      expect(result.message).toContain(
        "sigue dado de baja de: invitaciones a visitantes",
      );
    });

    it("says so for an address that is not blocked, without calling Resend", async () => {
      const email = address("not-blocked");
      expect(await actions.unblockEmail({ emailKey: email })).toMatchObject({
        success: false,
      });
      expect(removeResendSuppression).not.toHaveBeenCalled();
    });
  });

  describe("addUnsubscribe and removeUnsubscribe", () => {
    it("unsubscribes someone from all bulk mail for them, and takes it back", async () => {
      const email = address("Asked.By.Mail");

      expect(
        await actions.addUnsubscribe({ email: ` ${email} `, topic: "all" }),
      ).toMatchObject({ success: true });
      const [row] = await unsubscribesFor(email);
      expect(row).toMatchObject({
        emailKey: email.toLowerCase(),
        topic: "all",
        createdByUserId: ADMIN.id,
      });
      expect(
        await suppressions.isUnsubscribed(email, "participant_invitations"),
      ).toBe(true);

      expect(
        await actions.removeUnsubscribe({ emailKey: email, topic: "all" }),
      ).toMatchObject({ success: true });
      expect(await unsubscribesFor(email)).toEqual([]);

      expect(
        await actions.removeUnsubscribe({ emailKey: email, topic: "all" }),
      ).toMatchObject({ success: false });
    });

    it("removes only the unsubscribe it names", async () => {
      const email = address("two-topics");
      await suppressions.unsubscribe(email, "visitor_invitations");
      await suppressions.unsubscribe(email, "all");

      const result = await actions.removeUnsubscribe({
        emailKey: email,
        topic: "visitor_invitations",
      });

      expect((await unsubscribesFor(email)).map((row) => row.topic)).toEqual([
        "all",
      ]);
      // The admin is told the mail still will not go out.
      expect(result).toMatchObject({ success: true, warning: true });
      expect(result.message).toContain(
        "sigue dado de baja de: todos los correos masivos",
      );
    });

    it("refuses an invalid address or topic", async () => {
      expect(
        await actions.addUnsubscribe({ email: "not an email", topic: "all" }),
      ).toMatchObject({ success: false, message: "El correo no es válido" });
      expect(
        await actions.addUnsubscribe({
          email: address("x"),
          topic: "everything",
        }),
      ).toMatchObject({ success: false });
      expect(
        await actions.removeUnsubscribe({
          emailKey: address("x"),
          topic: "nope",
        }),
      ).toEqual({ success: false, message: "Datos inválidos" });
    });
  });

  describe("fetchEmailAdminPage", () => {
    it("lists each tab with whose address it is and who acted", async () => {
      const bounced = address("bounced");
      const unsubscribed = address("unsub");
      const lifted = address("lifted");
      const [visitor] = await integrationDb!
        .insert(visitors)
        .values({
          email: bounced.replace("bounced", "Bounced"),
          firstName: "Camila",
          lastName: "Rojas",
          phoneNumber: "+59171234567",
          birthdate: new Date("2000-01-01T12:00:00Z"),
        })
        .returning();
      created.visitors.push(visitor!.id);

      await suppressions.recordSuppression({
        address: bounced,
        reason: "bounce",
        detail: "NoEmail: gone",
      });
      await suppressions.unsubscribe(unsubscribed, "visitor_invitations");
      await suppressions.recordSuppression({
        address: lifted,
        reason: "complaint",
      });
      await actions.unblockEmail({ emailKey: lifted });

      const blocked = await page("blocked", MARK);
      expect(blocked?.rows.map((row) => row.emailKey)).toEqual([
        bounced.toLowerCase(),
      ]);
      expect(blocked?.rows[0]).toMatchObject({
        kind: "blocked",
        reason: "bounce",
        detail: "NoEmail: gone",
        people: [{ kind: "visitor", name: "Camila Rojas" }],
      });

      const unsubscribes = await page("unsubscribed", MARK);
      expect(unsubscribes?.rows).toMatchObject([
        {
          kind: "unsubscribed",
          emailKey: unsubscribed.toLowerCase(),
          topic: "visitor_invitations",
          createdBy: null,
        },
      ]);

      const history = await page("lifted", MARK);
      expect(history?.rows).toMatchObject([
        {
          kind: "lifted",
          emailKey: lifted.toLowerCase(),
          reason: "complaint",
          liftedBy: { id: ADMIN.id, name: "Ana Admin" },
        },
      ]);

      // Counts cover the whole database, which other suites share.
      expect(blocked!.counts.bounced).toBeGreaterThanOrEqual(1);
      expect(blocked!.counts.unsubscribed).toBeGreaterThanOrEqual(1);
      expect(blocked!.counts.lifted).toBeGreaterThanOrEqual(1);
    });

    it("finds an address by the name of the person it belongs to", async () => {
      const email = address("named");
      const tag = suffix().replace(/[^a-z0-9]/gi, "");
      const [visitor] = await integrationDb!
        .insert(visitors)
        .values({
          email,
          firstName: `Zoila${tag}`,
          lastName: "Vaca",
          phoneNumber: "+59171234567",
          birthdate: new Date("2000-01-01T12:00:00Z"),
        })
        .returning();
      created.visitors.push(visitor!.id);
      await suppressions.unsubscribe(email, "all");

      const found = await page("unsubscribed", `zoila${tag} vaca`);
      expect(found?.rows.map((row) => row.emailKey)).toEqual([
        email.toLowerCase(),
      ]);
      expect(found?.total).toBe(1);
    });

    it("treats LIKE wildcards in the search as plain text", async () => {
      await suppressions.unsubscribe(address("wild"), "all");
      const found = await page("unsubscribed", `%-${MARK}-%_`);
      expect(found?.total).toBe(0);
    });

    it("pages through a tab", async () => {
      for (let index = 0; index < 3; index += 1) {
        await suppressions.unsubscribe(address(`page${index}`), "all");
      }
      const first = await queries.fetchEmailAdminPage({
        tab: "unsubscribed",
        query: MARK,
        limit: 2,
        offset: 0,
      });
      const second = await queries.fetchEmailAdminPage({
        tab: "unsubscribed",
        query: MARK,
        limit: 2,
        offset: 2,
      });
      expect(first?.total).toBe(3);
      expect(first?.rows).toHaveLength(2);
      expect(second?.rows).toHaveLength(1);
      const keys = [...first!.rows, ...second!.rows].map((row) => row.emailKey);
      expect(new Set(keys).size).toBe(3);
    });
  });
});
