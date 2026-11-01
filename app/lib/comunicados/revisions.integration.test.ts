// @vitest-environment node

import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
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

/**
 * A sent comunicado's versions against a real database
 * (docs/IMPLEMENTATION-comunicados.md A5, F2, G6): "Historial" lists them
 * the first one first, with who wrote each and why; "Ver" reads one as it
 * was written. Global admins only. Every assertion is about this file's own
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
  flagOn: true,
  vercelEnv: "production",
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: async () => state.viewer,
  requireAdmin: async () =>
    state.viewer?.role === "admin" ? state.viewer : null,
}));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  isFeatureEnabled: async (key: string) =>
    key === "comunicados" && state.flagOn,
  isFeatureLaunched: async () => false,
  featureFlagGuard: async (key: string) =>
    key === "comunicados" && state.flagOn
      ? null
      : { success: false, message: "Esta funcionalidad no está disponible" },
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

type Revisions = typeof import("@/app/lib/comunicados/revisions");
type RevisionActions = typeof import("@/app/lib/comunicados/revision-actions");
type AppDb = (typeof import("@/db"))["db"];
let revisionsMod: Revisions;
let revisionActions: RevisionActions;
let appDb: AppDb;

const MISSING_ID = 2_147_483_000;
const TITLE = "Cambio de horario de armado";
const NEW_TITLE = "Cambio de horario de armado (corregido)";
const NOTE = "Cambió el horario de armado";

const created = {
  users: [] as number[],
  campaigns: [] as number[],
  comunicados: [] as number[],
};

async function createUser(
  role: Role = "admin",
  name: { displayName?: string; firstName?: string; lastName?: string } = {},
) {
  const suffix = randomUUID();
  const { rows } = await pool!.query<{ id: number }>(
    `INSERT INTO users
       (clerk_id, email, display_name, first_name, last_name, role, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'verified') RETURNING id`,
    [
      `revisions-${suffix}`,
      `revisions-${suffix}@example.test`,
      name.displayName ?? null,
      name.firstName ?? null,
      name.lastName ?? null,
      role,
    ],
  );
  created.users.push(rows[0]!.id);
  return rows[0]!.id;
}

function paragraph(text: string) {
  return [
    {
      type: "paragraph",
      props: {
        textAlignment: "left",
        textColor: "default",
        backgroundColor: "default",
      },
      content: [{ type: "text", text, styles: {} }],
      children: [],
    },
  ];
}

/** A comunicado sent by `by`, with its revision 1 as the send writes it. */
async function insertSent(by: number) {
  const { rows: campaign } = await pool!.query<{ id: number }>(
    `INSERT INTO notification_campaigns
       (type, status, title, message, created_by_user_id, idempotency_key)
     VALUES ('comunicado', 'completed', $1, 'El armado empieza a las 8:00.',
             $2, $3)
     RETURNING id`,
    [TITLE, by, `comunicado:revisions-test-${randomUUID()}`],
  );
  const campaignId = campaign[0]!.id;
  created.campaigns.push(campaignId);
  const { rows } = await pool!.query<{ id: number }>(
    `INSERT INTO comunicados
       (status, title, doc, send_email, send_push, audience, campaign_id,
        current_revision, sent_at, sent_by_user_id, audience_summary,
        version, created_by_user_id, updated_by_user_id)
     VALUES ('sent', $1, $2::jsonb, true, false,
             '{"festivals":[],"lists":[],"people":[]}'::jsonb, $3, 1, now(),
             $4, '{}'::jsonb, 2, $4, $4)
     RETURNING id`,
    [
      TITLE,
      JSON.stringify(paragraph("El armado empieza a las 8:00.")),
      campaignId,
      by,
    ],
  );
  const id = rows[0]!.id;
  created.comunicados.push(id);
  await addRevision(id, 1, {
    title: TITLE,
    text: "El armado empieza a las 8:00.",
    by,
  });
  return id;
}

async function addRevision(
  comunicadoId: number,
  revision: number,
  {
    title,
    text,
    by,
    note = null,
    actionLabel = null,
    actionPath = null,
  }: {
    title: string;
    text: string;
    by: number | null;
    note?: string | null;
    actionLabel?: string | null;
    actionPath?: string | null;
  },
) {
  await pool!.query(
    `INSERT INTO comunicado_revisions
       (comunicado_id, revision, title, doc, html, text, action_label,
        action_path, edit_note, created_by_user_id)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10)`,
    [
      comunicadoId,
      revision,
      title,
      JSON.stringify(paragraph(text)),
      `<p>${text}</p>`,
      text,
      actionLabel,
      actionPath,
      note,
      by,
    ],
  );
  if (revision > 1) {
    await pool!.query(
      `UPDATE comunicados SET current_revision = $2, title = $3,
              version = version + 1
       WHERE id = $1`,
      [comunicadoId, revision, title],
    );
  }
}

async function createdAtOf(comunicadoId: number, revision: number) {
  const { rows } = await pool!.query<{ created_at: string }>(
    `SELECT to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
     FROM comunicado_revisions WHERE comunicado_id = $1 AND revision = $2`,
    [comunicadoId, revision],
  );
  return rows[0]!.created_at;
}

describeDatabase("a comunicado's revisions", () => {
  let consoleError: MockInstance<typeof console.error>;
  let consoleLog: MockInstance<typeof console.log>;
  let dennis: number;
  let ana: number;

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    revisionsMod = await import("@/app/lib/comunicados/revisions");
    revisionActions = await import("@/app/lib/comunicados/revision-actions");
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
      await pool!.query(
        `SELECT edit_note, created_by_user_id FROM comunicado_revisions LIMIT 1`,
      );
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  beforeEach(async () => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    // The app's `db` logs every statement.
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    dennis = await createUser("admin", { displayName: "Dennis" });
    // No display name: the first and last names stand in for it.
    ana = await createUser("admin", { firstName: "Ana", lastName: "Rojas" });
    state.viewer = { id: dennis, role: "admin" };
  });

  afterEach(async () => {
    const errors = consoleError.mock.calls.map((args) => JSON.stringify(args));
    const statements = JSON.stringify(consoleLog.mock.calls);
    vi.restoreAllMocks();
    state.viewer = null;
    state.flagOn = true;
    if (created.comunicados.length > 0) {
      await pool!.query(
        `DELETE FROM comunicado_revisions WHERE comunicado_id = ANY($1::int[])`,
        [created.comunicados],
      );
      await pool!.query(`DELETE FROM comunicados WHERE id = ANY($1::int[])`, [
        created.comunicados,
      ]);
    }
    if (created.campaigns.length > 0) {
      await pool!.query(
        `DELETE FROM notification_campaigns WHERE id = ANY($1::int[])`,
        [created.campaigns],
      );
    }
    if (created.users.length > 0) {
      await pool!.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [
        created.users,
      ]);
    }
    for (const ids of Object.values(created)) ids.length = 0;
    expect(errors).toEqual([]);
    // No address travels as a parameter.
    expect(statements).not.toContain("@");
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("fetchComunicadoRevisions", () => {
    it("lists every version the first one first, with who wrote it and why", async () => {
      const id = await insertSent(dennis);
      await addRevision(id, 2, {
        title: NEW_TITLE,
        text: "El armado empieza a las 7:00.",
        by: ana,
        note: NOTE,
      });
      // Written by someone whose profile was deleted since.
      await addRevision(id, 3, {
        title: NEW_TITLE,
        text: "El armado empieza a las 7:30.",
        by: null,
      });

      const history = await revisionsMod.fetchComunicadoRevisions(id);

      expect(history).toEqual([
        {
          revision: 1,
          title: TITLE,
          editNote: null,
          createdAt: expect.any(Date),
          createdByName: "Dennis",
        },
        {
          revision: 2,
          title: NEW_TITLE,
          editNote: NOTE,
          createdAt: expect.any(Date),
          createdByName: "Ana Rojas",
        },
        {
          revision: 3,
          title: NEW_TITLE,
          editNote: null,
          createdAt: expect.any(Date),
          createdByName: null,
        },
      ]);
      // The moment each was written, as the database wrote it.
      expect(history![1]!.createdAt.toISOString()).toBe(
        await createdAtOf(id, 2),
      );
    });

    it("keeps each comunicado's versions apart, and has none for an unknown id", async () => {
      const first = await insertSent(dennis);
      const second = await insertSent(ana);
      await addRevision(second, 2, {
        title: NEW_TITLE,
        text: "El armado empieza a las 7:00.",
        by: ana,
        note: NOTE,
      });

      expect(
        (await revisionsMod.fetchComunicadoRevisions(first))!.map(
          (rev) => rev.revision,
        ),
      ).toEqual([1]);
      expect(
        (await revisionsMod.fetchComunicadoRevisions(second))!.map(
          (rev) => rev.revision,
        ),
      ).toEqual([1, 2]);
      expect(await revisionsMod.fetchComunicadoRevisions(MISSING_ID)).toEqual(
        [],
      );
    });

    it("answers null to anyone but a global admin", async () => {
      const id = await insertSent(dennis);

      for (const role of ["festival_admin", "user"] as const) {
        state.viewer = { id: await createUser(role), role };
        expect(await revisionsMod.fetchComunicadoRevisions(id)).toBeNull();
      }
      state.viewer = null;
      expect(await revisionsMod.fetchComunicadoRevisions(id)).toBeNull();
    });
  });

  describe("fetchComunicadoRevision", () => {
    it("reads one version as it was written: its document, HTML, text, button and note", async () => {
      const id = await insertSent(dennis);
      await addRevision(id, 2, {
        title: NEW_TITLE,
        text: "El armado empieza a las 7:00.",
        by: ana,
        note: NOTE,
        actionLabel: "Ver mi reserva",
        actionPath: "/my_participations",
      });

      const second = await revisionsMod.fetchComunicadoRevision(id, 2);
      expect(second).toEqual({
        revision: 2,
        title: NEW_TITLE,
        doc: paragraph("El armado empieza a las 7:00."),
        html: "<p>El armado empieza a las 7:00.</p>",
        text: "El armado empieza a las 7:00.",
        actionLabel: "Ver mi reserva",
        actionPath: "/my_participations",
        editNote: NOTE,
        createdAt: expect.any(Date),
        createdByName: "Ana Rojas",
      });
      expect(second!.createdAt.toISOString()).toBe(await createdAtOf(id, 2));

      // The first one stays as it was sent.
      expect(await revisionsMod.fetchComunicadoRevision(id, 1)).toMatchObject({
        revision: 1,
        title: TITLE,
        html: "<p>El armado empieza a las 8:00.</p>",
        actionLabel: null,
        actionPath: null,
        editNote: null,
        createdByName: "Dennis",
      });
    });

    it("answers null for a version or a comunicado that does not exist", async () => {
      const id = await insertSent(dennis);

      expect(await revisionsMod.fetchComunicadoRevision(id, 2)).toBeNull();
      expect(
        await revisionsMod.fetchComunicadoRevision(MISSING_ID, 1),
      ).toBeNull();
    });

    it("answers null to anyone but a global admin", async () => {
      const id = await insertSent(dennis);

      state.viewer = {
        id: await createUser("festival_admin"),
        role: "festival_admin",
      };
      expect(await revisionsMod.fetchComunicadoRevision(id, 1)).toBeNull();
    });
  });

  describe("the action", () => {
    it("opens a version for a global admin with the flag, its time as ISO", async () => {
      const id = await insertSent(dennis);
      await addRevision(id, 2, {
        title: NEW_TITLE,
        text: "El armado empieza a las 7:00.",
        by: ana,
        note: NOTE,
      });

      expect(
        await revisionActions.loadComunicadoRevisionAction({
          comunicadoId: id,
          revision: 2,
        }),
      ).toEqual({
        success: true,
        revision: {
          revision: 2,
          title: NEW_TITLE,
          html: "<p>El armado empieza a las 7:00.</p>",
          actionLabel: null,
          actionPath: null,
          editNote: NOTE,
          createdAt: await createdAtOf(id, 2),
          createdByName: "Ana Rojas",
        },
      });
      expect(
        await revisionActions.loadComunicadoRevisionAction({
          comunicadoId: id,
          revision: 3,
        }),
      ).toEqual({ success: false, message: "No encontramos esta versión." });
    });

    it("refuses a festival admin, and anyone while the flag is off", async () => {
      const id = await insertSent(dennis);

      state.viewer = {
        id: await createUser("festival_admin"),
        role: "festival_admin",
      };
      expect(
        await revisionActions.loadComunicadoRevisionAction({
          comunicadoId: id,
          revision: 1,
        }),
      ).toEqual({ success: false, message: "No autorizado." });

      state.viewer = { id: dennis, role: "admin" };
      state.flagOn = false;
      expect(
        await revisionActions.loadComunicadoRevisionAction({
          comunicadoId: id,
          revision: 1,
        }),
      ).toEqual({
        success: false,
        message: "Esta funcionalidad no está disponible",
      });
    });
  });
});
