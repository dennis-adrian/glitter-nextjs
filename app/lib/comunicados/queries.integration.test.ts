// @vitest-environment node

import { randomUUID } from "crypto";
import { inArray, sql } from "drizzle-orm";
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
  type MockInstance,
  vi,
} from "vitest";

import * as schema from "@/db/schema";
import {
  comunicadoRevisions,
  comunicados,
  notificationCampaigns,
  users,
} from "@/db/schema";

/**
 * What PR 6's pages read from `queries.ts`, against a real database
 * (docs/IMPLEMENTATION-comunicados.md E1, E6, G3, G6): the version an
 * overdue row's "Enviar ahora" expects, who scheduled a scheduled one, and
 * the title "Copia de «…»" names. Every assertion is about this file's own
 * rows.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));

type Role = "admin" | "festival_admin" | "user";
type Viewer = { id: number; role: Role };
const state = vi.hoisted(() => ({
  viewer: null as Viewer | null,
  vercelEnv: "production",
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: async () => state.viewer,
  requireAdmin: async () =>
    state.viewer?.role === "admin" ? state.viewer : null,
}));
vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return {
    ...actual,
    serverEnv: new Proxy(actual.serverEnv, {
      get: (target, key) =>
        key === "VERCEL_ENV" ? state.vercelEnv : Reflect.get(target, key),
    }),
  };
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string): boolean {
  try {
    return /(^|[_-])(test|ci)([_-]|$)/i.test(
      decodeURIComponent(new URL(url).pathname.slice(1)),
    );
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 4 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Queries = typeof import("@/app/lib/comunicados/queries");
type AppDb = (typeof import("@/db"))["db"];
let queries: Queries;
let appDb: AppDb;

const MISSING_ID = 2_147_483_000;
/** Newer than anything else the database holds: first on its tab's page. */
const NEWEST = "2100-01-01T00:00:00Z";
const TEXT = "El armado empieza a las 8:00.";
const DOC = [
  {
    type: "paragraph",
    props: {},
    content: [{ type: "text", text: TEXT, styles: {} }],
    children: [],
  },
];

const created = {
  users: [] as number[],
  campaigns: [] as number[],
  comunicados: [] as number[],
};

async function createUser(
  role: Role,
  names: {
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } = {},
) {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `queries-${suffix}`,
      email: `queries-${suffix}@example.test`,
      displayName: `Consultas ${suffix.slice(0, 8)}`,
      role,
      status: "verified",
      ...names,
    })
    .returning({ id: users.id });
  created.users.push(user!.id);
  return user!.id;
}

async function insertDraft(title: string, authorId: number) {
  const { rows } = await pool!.query<{ id: number }>(
    `INSERT INTO comunicados (title, doc, created_by_user_id, updated_by_user_id)
     VALUES ($1, $2::jsonb, $3, $3)
     RETURNING id`,
    [title, JSON.stringify(DOC), authorId],
  );
  created.comunicados.push(rows[0]!.id);
  return rows[0]!.id;
}

/** Scheduled a day ahead by `scheduler`, at version 4, newest on its tab. */
async function insertScheduled(scheduler: number | null, authorId: number) {
  const { rows } = await pool!.query<{ id: number }>(
    `INSERT INTO comunicados
       (status, version, title, doc, scheduled_at, scheduled_by_user_id,
        created_by_user_id, updated_by_user_id, updated_at)
     VALUES ('scheduled', 4, 'Cambio de horario de armado', $1::jsonb,
             now() + interval '1 day', $2, $3, $3, $4::timestamp)
     RETURNING id`,
    [JSON.stringify(DOC), scheduler, authorId, NEWEST],
  );
  created.comunicados.push(rows[0]!.id);
  return rows[0]!.id;
}

/**
 * A sent comunicado edited once: revision 2 is current, and the working copy
 * still holds what was written before the send (D16).
 */
async function insertEditedSent(authorId: number) {
  const campaign = await pool!.query<{ id: number }>(
    `INSERT INTO notification_campaigns
       (type, status, title, message, created_by_user_id, idempotency_key)
     VALUES ('comunicado', 'completed', 'Título enviado', $1, $2, $3)
     RETURNING id`,
    [TEXT, authorId, `comunicado:test-${randomUUID()}`],
  );
  const campaignId = campaign.rows[0]!.id;
  created.campaigns.push(campaignId);
  const { rows } = await pool!.query<{ id: number }>(
    `INSERT INTO comunicados
       (status, title, doc, campaign_id, current_revision, sent_at,
        sent_by_user_id, created_by_user_id, updated_by_user_id)
     VALUES ('sent', '  Título de trabajo  ', $1::jsonb, $2, 2, now(), $3, $3, $3)
     RETURNING id`,
    [JSON.stringify(DOC), campaignId, authorId],
  );
  const comunicadoId = rows[0]!.id;
  created.comunicados.push(comunicadoId);
  await pool!.query(
    `INSERT INTO comunicado_revisions
       (comunicado_id, revision, title, doc, html, text, created_by_user_id)
     VALUES ($1, 1, 'Título enviado', $2::jsonb, $3, $4, $5),
            ($1, 2, 'Título editado', $2::jsonb, $3, $4, $5)`,
    [comunicadoId, JSON.stringify(DOC), `<p>${TEXT}</p>`, TEXT, authorId],
  );
  return comunicadoId;
}

describeDatabase("comunicados queries (integration)", () => {
  let consoleLog: MockInstance<typeof console.log>;

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    queries = await import("@/app/lib/comunicados/queries");
    appDb = (await import("@/db")).db;

    // Everything under test reads through the app's pool: it must be this
    // database.
    const { rows } = await pool!.query<{ name: string }>(
      "SELECT current_database() AS name",
    );
    const appName = await appDb.execute<{ name: string }>(
      sql`SELECT current_database() AS name`,
    );
    expect(appName.rows[0]?.name).toBe(rows[0]?.name);
    try {
      await integrationDb!
        .select({ id: comunicados.id })
        .from(comunicados)
        .limit(1);
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  beforeEach(() => {
    // The app's `db` logs every statement; everything here goes through it.
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    // Every statement the app ran, with its params: no address in any.
    const statements = JSON.stringify(consoleLog.mock.calls);
    vi.restoreAllMocks();
    state.viewer = null;
    state.vercelEnv = "production";
    const db = integrationDb!;
    if (created.comunicados.length > 0) {
      await db
        .delete(comunicadoRevisions)
        .where(inArray(comunicadoRevisions.comunicadoId, created.comunicados));
      await db
        .delete(comunicados)
        .where(inArray(comunicados.id, created.comunicados));
    }
    if (created.campaigns.length > 0) {
      await db
        .delete(notificationCampaigns)
        .where(inArray(notificationCampaigns.id, created.campaigns));
    }
    if (created.users.length > 0) {
      await db.delete(users).where(inArray(users.id, created.users));
    }
    for (const ids of Object.values(created)) ids.length = 0;
    expect(statements).not.toContain("@");
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("lists each row with the version an overdue one's Enviar ahora expects", async () => {
    const admin = await createUser("admin");
    state.viewer = { id: admin, role: "admin" };
    const id = await insertScheduled(admin, admin);

    const list = await queries.fetchComunicadoList({
      tab: "scheduled",
      page: 1,
    });
    const found = list.rows.find((row) => row.id === id);
    expect(found).toMatchObject({ id, version: 4, status: "scheduled" });
  });

  it("names people without a display name by their first and last names", async () => {
    const admin = await createUser("admin");
    const ana = await createUser("admin", {
      displayName: null,
      firstName: "Ana",
      lastName: "Pérez",
    });
    state.viewer = { id: admin, role: "admin" };
    const sent = await insertEditedSent(ana);
    await pool!.query(
      "UPDATE comunicados SET updated_at = $2::timestamp WHERE id = $1",
      [sent, NEWEST],
    );

    const list = await queries.fetchComunicadoList({ tab: "sent", page: 1 });
    expect(list.rows.find((row) => row.id === sent)).toMatchObject({
      createdByName: "Ana Pérez",
      updatedByName: "Ana Pérez",
      sentByName: "Ana Pérez",
    });
  });

  it("names who scheduled a scheduled one, and nobody once that is gone", async () => {
    const admin = await createUser("admin");
    const scheduler = await createUser("admin", {
      displayName: null,
      firstName: "Dennis",
    });
    state.viewer = { id: admin, role: "admin" };
    const byDennis = await insertScheduled(scheduler, admin);
    const byNobody = await insertScheduled(null, admin);
    const draft = await insertDraft("Borrador", admin);

    expect(await queries.fetchComunicadoForComposer(byDennis)).toMatchObject({
      status: "scheduled",
      version: 4,
      scheduledByName: "Dennis",
      title: "Cambio de horario de armado",
      doc: DOC,
    });
    expect(
      (await queries.fetchComunicadoForComposer(byNobody))?.scheduledByName,
    ).toBeNull();
    expect(
      (await queries.fetchComunicadoForComposer(draft))?.scheduledByName,
    ).toBeNull();
  });

  describe("fetchComunicadoCopySourceTitle", () => {
    it("reads a sent comunicado's current revision, not its working copy", async () => {
      const admin = await createUser("admin");
      state.viewer = { id: admin, role: "admin" };
      const sent = await insertEditedSent(admin);

      expect(await queries.fetchComunicadoCopySourceTitle(sent)).toBe(
        "Título editado",
      );
    });

    it("reads any other's working title, trimmed, blank included", async () => {
      const admin = await createUser("admin");
      state.viewer = { id: admin, role: "admin" };
      const draft = await insertDraft("  Cambio de horario  ", admin);
      const untitled = await insertDraft("   ", admin);
      const scheduled = await insertScheduled(admin, admin);

      expect(await queries.fetchComunicadoCopySourceTitle(draft)).toBe(
        "Cambio de horario",
      );
      expect(await queries.fetchComunicadoCopySourceTitle(untitled)).toBe("");
      expect(await queries.fetchComunicadoCopySourceTitle(scheduled)).toBe(
        "Cambio de horario de armado",
      );
    });

    it("answers nothing for an id that does not exist, or to anyone but a global admin", async () => {
      const admin = await createUser("admin");
      const festivalAdmin = await createUser("festival_admin");
      const draft = await insertDraft("Cambio de horario", admin);

      state.viewer = { id: admin, role: "admin" };
      expect(await queries.fetchComunicadoCopySourceTitle(MISSING_ID)).toBe(
        null,
      );
      state.viewer = { id: festivalAdmin, role: "festival_admin" };
      expect(await queries.fetchComunicadoCopySourceTitle(draft)).toBeNull();
      state.viewer = null;
      expect(await queries.fetchComunicadoCopySourceTitle(draft)).toBeNull();
    });
  });
});
