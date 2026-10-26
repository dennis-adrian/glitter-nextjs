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
 * "Duplicar" against a real database (docs/IMPLEMENTATION-comunicados.md
 * G6): from any state, a new draft with what the comunicado says now (a sent
 * one's current revision, anything else's working copy), its email choice
 * and its audience, and never its push, essential mark, schedule or missed
 * schedule. Every assertion is about this file's own rows.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

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

type Duplicate = typeof import("@/app/lib/comunicados/duplicate");
type DuplicateActions =
  typeof import("@/app/lib/comunicados/duplicate-actions");
type AppDb = (typeof import("@/db"))["db"];
let duplicateMod: Duplicate;
let duplicateActions: DuplicateActions;
let appDb: AppDb;

const MISSING_ID = 2_147_483_000;
const ESSENTIAL_REASON = "El armado se adelanta a las 7:00 por la lluvia";

const created = {
  users: [] as number[],
  campaigns: [] as number[],
  comunicados: [] as number[],
};

async function createUser(role: Role = "user") {
  const suffix = randomUUID();
  const { rows } = await pool!.query<{ id: number }>(
    `INSERT INTO users (clerk_id, email, display_name, role, status)
     VALUES ($1, $2, $3, $4, 'verified') RETURNING id`,
    [
      `duplicate-${suffix}`,
      `duplicate-${suffix}@example.test`,
      `Copia ${suffix.slice(0, 8)}`,
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
      props: {},
      content: [{ type: "text", text, styles: {} }],
      children: [],
    },
  ];
}

type Content = {
  title: string;
  doc: unknown[];
  actionLabel: string | null;
  actionPath: string | null;
};

const ORIGINAL: Content = {
  title: "Cambio de horario de armado",
  doc: paragraph("El armado empieza a las 8:00."),
  actionLabel: "Ver mi reserva",
  actionPath: "/my_participations",
};
/** What an edit made of it: a new text and no button. */
const EDITED: Content = {
  title: "Cambio de horario de armado (corregido)",
  doc: paragraph("El armado empieza a las 7:00."),
  actionLabel: null,
  actionPath: null,
};

type Audience = { festivals: number[]; lists: number[]; people: number[] };

/**
 * Every column the copy might carry over, set to something to tell apart:
 * push ticked, essential (confirmed once scheduled or sent, as the CHECKs
 * want), a schedule on anything but a draft. Email is ticked unless
 * `sendEmail` says not, which the CHECKs allow an essential one only as a
 * draft.
 */
async function insertComunicado(
  status: "draft" | "scheduled" | "sent",
  {
    by,
    audience,
    content = ORIGINAL,
    missed = false,
    sendEmail = true,
  }: {
    by: number;
    audience: Audience;
    content?: Content;
    missed?: boolean;
    sendEmail?: boolean;
  },
) {
  if (!sendEmail && status !== "draft") {
    throw new Error("An essential comunicado with no email is only a draft.");
  }
  let campaignId: number | null = null;
  if (status === "sent") {
    const { rows } = await pool!.query<{ id: number }>(
      `INSERT INTO notification_campaigns
         (type, status, title, message, created_by_user_id, idempotency_key)
       VALUES ('comunicado', 'completed', $1, 'Texto', $2, $3)
       RETURNING id`,
      [content.title, by, `comunicado:duplicate-test-${randomUUID()}`],
    );
    campaignId = rows[0]!.id;
    created.campaigns.push(campaignId);
  }
  const { rows } = await pool!.query<{ id: number }>(
    `INSERT INTO comunicados
       (status, title, doc, action_label, action_path, send_email, send_push,
        audience, essential, essential_reason, essential_confirmed_by_user_id,
        essential_confirmed_at, scheduled_at, scheduled_by_user_id,
        schedule_missed_at, schedule_missed_reason, schedule_missed_detail,
        campaign_id, current_revision, sent_at, sent_by_user_id,
        audience_summary, autosave_key, version, created_by_user_id,
        updated_by_user_id)
     VALUES ($1::comunicado_status, $2, $3::jsonb, $4, $5, $12, true,
             $6::jsonb, true, $7, CASE WHEN $1::text <> 'draft' THEN $8::int END,
             CASE WHEN $1::text <> 'draft' THEN now() END,
             CASE WHEN $1::text <> 'draft' THEN now() + interval '1 day' END,
             CASE WHEN $1::text <> 'draft' THEN $8::int END,
             CASE WHEN $9 THEN now() END,
             CASE WHEN $9 THEN 'too_large' END,
             CASE WHEN $9 THEN 'Al enviarlo, la audiencia sumaba 3.120 personas y el máximo es 3.000. Quedó como borrador.' END,
             $10, CASE WHEN $10::int IS NOT NULL THEN 1 END,
             CASE WHEN $10::int IS NOT NULL THEN now() END,
             CASE WHEN $10::int IS NOT NULL THEN $8::int END,
             CASE WHEN $10::int IS NOT NULL THEN '{}'::jsonb END,
             $11, 7, $8, $8)
     RETURNING id`,
    [
      status,
      content.title,
      JSON.stringify(content.doc),
      content.actionLabel,
      content.actionPath,
      JSON.stringify(audience),
      ESSENTIAL_REASON,
      by,
      missed,
      campaignId,
      randomUUID(),
      sendEmail,
    ],
  );
  const id = rows[0]!.id;
  created.comunicados.push(id);
  if (status === "sent") await addRevision(id, 1, content, by);
  return id;
}

async function addRevision(
  comunicadoId: number,
  revision: number,
  content: Content,
  by: number,
) {
  await pool!.query(
    `INSERT INTO comunicado_revisions
       (comunicado_id, revision, title, doc, html, text, action_label,
        action_path, edit_note, created_by_user_id)
     VALUES ($1, $2, $3, $4::jsonb, '<p>Texto</p>', 'Texto', $5, $6,
             CASE WHEN $2 > 1 THEN 'Cambió el horario' END, $7)`,
    [
      comunicadoId,
      revision,
      content.title,
      JSON.stringify(content.doc),
      content.actionLabel,
      content.actionPath,
      by,
    ],
  );
}

/** An edit as F1 step 4 leaves it: the title and the revision, not the rest. */
async function edit(comunicadoId: number, by: number) {
  await addRevision(comunicadoId, 2, EDITED, by);
  await pool!.query(
    `UPDATE comunicados
     SET current_revision = 2, title = $2, version = version + 1
     WHERE id = $1`,
    [comunicadoId, EDITED.title],
  );
}

async function comunicadoRow(id: number) {
  const { rows } = await pool!.query<Record<string, unknown>>(
    `SELECT status, version, title, doc, action_label, action_path,
            send_email, send_push, audience, essential, essential_reason,
            essential_confirmed_by_user_id, essential_confirmed_at,
            scheduled_at, scheduled_by_user_id, schedule_missed_at,
            schedule_missed_reason, schedule_missed_detail, campaign_id,
            current_revision, sent_at, sent_by_user_id, audience_summary,
            retracted_at, autosave_key, created_by_user_id, updated_by_user_id
     FROM comunicados WHERE id = $1`,
    [id],
  );
  return rows[0];
}

/**
 * A fresh draft with `content`, the source's email choice (ticked unless
 * said) and `audience`, nothing else.
 */
function freshCopy(
  content: Content,
  audience: Audience,
  by: number,
  sendEmail = true,
) {
  return {
    status: "draft",
    version: 1,
    title: content.title,
    doc: content.doc,
    action_label: content.actionLabel,
    action_path: content.actionPath,
    send_email: sendEmail,
    send_push: false,
    audience,
    essential: false,
    essential_reason: null,
    essential_confirmed_by_user_id: null,
    essential_confirmed_at: null,
    scheduled_at: null,
    scheduled_by_user_id: null,
    schedule_missed_at: null,
    schedule_missed_reason: null,
    schedule_missed_detail: null,
    campaign_id: null,
    current_revision: null,
    sent_at: null,
    sent_by_user_id: null,
    audience_summary: null,
    retracted_at: null,
    autosave_key: null,
    created_by_user_id: by,
    updated_by_user_id: by,
  };
}

async function copiesBy(userId: number) {
  const { rows } = await pool!.query<{ copies: number }>(
    `SELECT count(*)::int AS copies FROM comunicados
     WHERE created_by_user_id = $1`,
    [userId],
  );
  return rows[0]!.copies;
}

async function duplicate(sourceId: number, by: number) {
  const id = await duplicateMod.duplicateComunicado(sourceId, by);
  if (id !== null) created.comunicados.push(id);
  return id;
}

describeDatabase("duplicating a comunicado", () => {
  let consoleError: MockInstance<typeof console.error>;
  let consoleLog: MockInstance<typeof console.log>;
  let audience: Audience;
  let author: number;
  let copier: number;

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    duplicateMod = await import("@/app/lib/comunicados/duplicate");
    duplicateActions = await import("@/app/lib/comunicados/duplicate-actions");
    appDb = (await import("@/db")).db;

    // Everything under test writes through the app's pool: it must be this
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
        `SELECT schedule_missed_detail, current_revision FROM comunicados LIMIT 1`,
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
    author = await createUser("admin");
    copier = await createUser("admin");
    audience = {
      festivals: [],
      lists: [],
      people: [await createUser(), await createUser()],
    };
  });

  afterEach(async () => {
    const errors = consoleError.mock.calls.map((args) => JSON.stringify(args));
    const statements = JSON.stringify(consoleLog.mock.calls);
    vi.restoreAllMocks();
    state.viewer = null;
    state.flagOn = true;
    revalidatePath.mockClear();
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
    expect(statements).not.toContain("@");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("copies a sent comunicado that was edited from its current revision, with its email choice and audience", async () => {
    const source = await insertComunicado("sent", { by: author, audience });
    await edit(source, author);

    const copy = await duplicate(source, copier);

    expect(copy).not.toBeNull();
    expect(copy).not.toBe(source);
    // Revision 2 has no button, while the working copy still carries
    // revision 1's: the copy has none.
    expect(await comunicadoRow(copy!)).toEqual(
      freshCopy(EDITED, audience, copier),
    );
  });

  it("copies a scheduled comunicado from its working copy, without its schedule or essential mark", async () => {
    const source = await insertComunicado("scheduled", {
      by: author,
      audience,
    });

    const copy = await duplicate(source, copier);

    expect(await comunicadoRow(copy!)).toEqual(
      freshCopy(ORIGINAL, audience, copier),
    );
    // The source is left as it was.
    expect(await comunicadoRow(source)).toMatchObject({
      status: "scheduled",
      essential: true,
      version: 7,
    });
  });

  it("copies a draft that missed its schedule, with its email unticked, without the miss", async () => {
    const source = await insertComunicado("draft", {
      by: author,
      audience,
      missed: true,
      sendEmail: false,
    });

    const copy = await duplicate(source, copier);

    expect(await comunicadoRow(copy!)).toEqual(
      freshCopy(ORIGINAL, audience, copier, false),
    );
  });

  it("copies a retracted comunicado, the usual fix after retracting one", async () => {
    const source = await insertComunicado("sent", { by: author, audience });
    await pool!.query(
      `UPDATE comunicados
       SET retracted_at = now(), retracted_by_user_id = $2,
         retract_reason = 'Salió con el horario equivocado'
       WHERE id = $1`,
      [source, author],
    );

    const copy = await duplicate(source, copier);

    expect(await comunicadoRow(copy!)).toEqual(
      freshCopy(ORIGINAL, audience, copier),
    );
  });

  it("answers null for a comunicado that does not exist, writing nothing", async () => {
    expect(await duplicate(MISSING_ID, copier)).toBeNull();
    expect(await copiesBy(copier)).toBe(0);
  });

  describe("the action", () => {
    it("copies for a global admin with the flag, as them, and refreshes the list", async () => {
      const source = await insertComunicado("sent", { by: author, audience });
      state.viewer = { id: copier, role: "admin" };

      const result = await duplicateActions.duplicateComunicadoAction(source);

      if (!result.success) throw new Error(result.message);
      created.comunicados.push(result.comunicadoId);
      expect(await comunicadoRow(result.comunicadoId)).toEqual(
        freshCopy(ORIGINAL, audience, copier),
      );
      expect(revalidatePath.mock.calls).toEqual([
        ["/dashboard/communications"],
      ]);
      expect(
        await duplicateActions.duplicateComunicadoAction(MISSING_ID),
      ).toEqual({
        success: false,
        message: "No encontramos este comunicado.",
      });
    });

    it("refuses a festival admin, and anyone while the flag is off", async () => {
      const source = await insertComunicado("draft", { by: author, audience });

      state.viewer = {
        id: await createUser("festival_admin"),
        role: "festival_admin",
      };
      expect(await duplicateActions.duplicateComunicadoAction(source)).toEqual({
        success: false,
        message: "No autorizado.",
      });
      state.viewer = { id: copier, role: "admin" };
      state.flagOn = false;
      expect(await duplicateActions.duplicateComunicadoAction(source)).toEqual({
        success: false,
        message: "Esta funcionalidad no está disponible",
      });

      expect(await copiesBy(copier)).toBe(0);
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });
});
