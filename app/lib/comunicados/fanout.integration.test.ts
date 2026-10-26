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

import {
  type ComunicadoAudienceSummary,
  parseComunicadoAudienceSummary,
} from "@/app/lib/comunicados/definitions";
import * as schema from "@/db/schema";
import {
  comunicadoRevisions,
  comunicados,
  notificationCampaigns,
  notifications,
  pendingUserDeletions,
  pushSubscriptions,
  users,
} from "@/db/schema";

/**
 * A sent comunicado's fan-out against a real database
 * (docs/IMPLEMENTATION-comunicados.md D2, B5, B6, D9, V5, V10): `notifyMany`,
 * the chunk's re-judging under its locks, crash and transient recovery,
 * poison isolation, the lane's environment filter, completion and the sweep.
 * No send exists to make the fixtures, so a sent comunicado is inserted as the
 * send leaves it. Every assertion is about this file's own rows.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
  sendBatchEmails: vi.fn(),
}));

const state = vi.hoisted(() => ({
  vercelEnv: "production",
  /** Runs inside the chunk's transaction, around `notifyMany`. */
  beforeNotifyMany: null as
    | null
    | ((userIds: readonly number[]) => void | Promise<void>),
  afterNotifyMany: null as
    | null
    | ((userIds: readonly number[]) => void | Promise<void>),
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: async () => null,
  requireAdmin: async () => null,
}));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  isFeatureEnabled: async (key: string) => key === "comunicados",
  isFeatureLaunched: async () => false,
  featureFlagGuard: async (key: string) =>
    key === "comunicados"
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
// The real `notifyMany`, with a hook to fail or hold a chunk mid-transaction.
vi.mock("@/app/lib/notifications/notify", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/lib/notifications/notify")>();
  return {
    ...actual,
    notifyMany: async (...args: Parameters<typeof actual.notifyMany>) => {
      await state.beforeNotifyMany?.(args[1].userIds);
      const result = await actual.notifyMany(...args);
      await state.afterNotifyMany?.(args[1].userIds);
      return result;
    },
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 6 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Fanout = typeof import("@/app/lib/comunicados/fanout");
type Notify = typeof import("@/app/lib/notifications/notify");
type AppDb = (typeof import("@/db"))["db"];
let fanout: Fanout;
let notify: Notify;
let appDb: AppDb;

const STAGING = "Entorno de prueba: no se envía a listas";
const NOT_PARTICIPANT = "No es participante";
const MISSING_ID = 2_147_483_000;
/** Older than anything else the shared database holds, so lane-wide reads take these first. */
const LONG_AGO = "2001-01-01T00:00:00Z";

const created = {
  users: [] as number[],
  campaigns: [] as number[],
  comunicados: [] as number[],
  deletions: [] as number[],
};

type Role = "admin" | "festival_admin" | "user";
type Status = "verified" | "pending" | "banned" | "paused";
type Source = "list" | "person" | "staging_admin" | null;

async function createUser(
  role: Role = "user",
  status: Status = "verified",
): Promise<number> {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `fanout-${suffix}`,
      email: `fanout-${suffix}@example.com`,
      displayName: `Fan-out ${suffix.slice(0, 8)}`,
      role,
      status,
    })
    .returning({ id: users.id });
  created.users.push(user!.id);
  return user!.id;
}

async function addDevice(userId: number) {
  const [device] = await integrationDb!
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: `https://push.example.test/${randomUUID()}`,
      p256dh: "p256dh",
      auth: "auth",
      applicationServerKey: "fanout-test-key",
    })
    .returning({ id: pushSubscriptions.id });
  return device!.id;
}

async function markDeleting(userId: number) {
  const [row] = await integrationDb!
    .insert(pendingUserDeletions)
    .values({ userId, clerkId: `fanout-del-${randomUUID()}` })
    .returning({ id: pendingUserDeletions.id });
  created.deletions.push(row!.id);
}

function summaryFor(
  env: ComunicadoAudienceSummary["env"],
): ComunicadoAudienceSummary {
  return {
    v: 1,
    env,
    narrowed: env !== "production",
    sources: [],
    matched: 0,
    eligible: 0,
    willReceive: 0,
    stagingAdmins: 0,
    pickedByName: 0,
    skipped: [],
    channels: { email: true, push: false },
    email: {
      sendTo: 0,
      unsubscribedAnnouncements: 0,
      unsubscribedAll: 0,
      suppressed: 0,
      invalid: 0,
    },
    essentialFestival: null,
    essentialOverride: 0,
    essentialNotOverridden: 0,
  };
}

type SentFixture = {
  campaignId: number;
  comunicadoId: number;
  /** Recipient row id by user id. */
  recipients: Map<number, number>;
};

/**
 * A comunicado as the send leaves it: a processing campaign, the sent row
 * with its frozen summary, its revisions, and one pending recipient row per
 * person with the source given.
 */
async function insertSent({
  people,
  env = "production",
  sendEmail = true,
  sendPush = false,
  revisions = 1,
  action = null,
  createdAt = null,
}: {
  people: { userId: number; source: Source }[];
  env?: ComunicadoAudienceSummary["env"];
  sendEmail?: boolean;
  sendPush?: boolean;
  /** The current revision; each one before it exists too. */
  revisions?: number;
  action?: { label: string; path: string } | null;
  createdAt?: string | null;
}): Promise<SentFixture> {
  const author = await createUser("admin");
  const title = `Revisión ${revisions}`;
  const campaign = await pool!.query<{ id: number }>(
    `INSERT INTO notification_campaigns
       (type, status, title, message, created_by_user_id, idempotency_key, created_at)
     VALUES ('comunicado', 'processing', $1, 'Texto enviado', $2, $3, coalesce($4::timestamp, now()))
     RETURNING id`,
    [title, author, `comunicado:test-${randomUUID()}`, createdAt],
  );
  const campaignId = campaign.rows[0]!.id;
  created.campaigns.push(campaignId);

  const summary = summaryFor(env);
  expect(parseComunicadoAudienceSummary(summary)).toEqual(summary);
  const comunicado = await pool!.query<{ id: number }>(
    `INSERT INTO comunicados
       (status, title, campaign_id, current_revision, sent_at, sent_by_user_id,
        audience_summary, send_email, send_push, action_label, action_path,
        created_by_user_id, updated_by_user_id)
     VALUES ('sent', $1, $2, $3, now(), $4, $5::jsonb, $6, $7, $8, $9, $4, $4)
     RETURNING id`,
    [
      title,
      campaignId,
      revisions,
      author,
      JSON.stringify(summary),
      sendEmail,
      sendPush,
      action?.label ?? null,
      action?.path ?? null,
    ],
  );
  const comunicadoId = comunicado.rows[0]!.id;
  created.comunicados.push(comunicadoId);
  for (let revision = 1; revision <= revisions; revision += 1) {
    await pool!.query(
      `INSERT INTO comunicado_revisions
         (comunicado_id, revision, title, doc, html, text, action_label,
          action_path, created_by_user_id)
       VALUES ($1, $2, $3, '[]'::jsonb, '<p>Texto</p>', $4, $5, $6, $7)`,
      [
        comunicadoId,
        revision,
        `Revisión ${revision}`,
        `Texto de la revisión ${revision}.\n\nSegundo   párrafo.`,
        action?.label ?? null,
        action?.path ?? null,
        author,
      ],
    );
  }

  const inserted = await pool!.query<{ id: number; user_id: number }>(
    `INSERT INTO notification_campaign_recipients (campaign_id, user_id, status, source)
     SELECT $1, t.user_id, 'pending', t.source::campaign_recipient_source
     FROM unnest($2::int[], $3::text[]) AS t(user_id, source)
     RETURNING id, user_id`,
    [campaignId, people.map((p) => p.userId), people.map((p) => p.source)],
  );
  return {
    campaignId,
    comunicadoId,
    recipients: new Map(inserted.rows.map((row) => [row.user_id, row.id])),
  };
}

type RecipientRow = {
  id: number;
  user_id: number;
  status: string;
  skipped_reason: string | null;
  attempts: number;
  last_error: string | null;
  notification_id: number | null;
  processed: boolean;
};

async function recipientsOf(campaignId: number) {
  const { rows } = await pool!.query<RecipientRow>(
    `SELECT id, user_id, status, skipped_reason, attempts, last_error,
            notification_id, processed_at IS NOT NULL AS processed
     FROM notification_campaign_recipients WHERE campaign_id = $1`,
    [campaignId],
  );
  return new Map(rows.map((row) => [row.user_id, row]));
}

type ItemRow = {
  id: number;
  user_id: number;
  kind: string;
  category: string;
  title: string;
  body: string;
  action_path: string | null;
  action_label: string | null;
  data: Record<string, unknown>;
  dedupe_key: string;
  read: boolean;
};

async function itemsOf(campaignId: number) {
  const { rows } = await pool!.query<ItemRow>(
    `SELECT id, user_id, kind, category, title, body, action_path, action_label,
            data, dedupe_key, read_at IS NOT NULL AS read
     FROM notifications WHERE campaign_id = $1`,
    [campaignId],
  );
  return rows;
}

type DeliveryRow = {
  id: number;
  notification_id: number;
  user_id: number;
  template_key: string;
  channel: string;
  lane: string;
  status: string;
  recipient_email: string | null;
  push_subscription_id: number | null;
  payload: Record<string, unknown>;
  idempotency_key: string;
  batch_key: string | null;
  maybe_sent: boolean;
  content_revision: number | null;
};

async function deliveriesOf(campaignId: number) {
  const { rows } = await pool!.query<DeliveryRow>(
    `SELECT d.id, d.notification_id, d.user_id, d.template_key, d.channel,
            d.lane, d.status, d.recipient_email, d.push_subscription_id,
            d.payload, d.idempotency_key, d.batch_key,
            d.maybe_sent_at IS NOT NULL AS maybe_sent, d.content_revision
     FROM notification_deliveries d
     JOIN notifications n ON n.id = d.notification_id
     WHERE n.campaign_id = $1
     ORDER BY d.id`,
    [campaignId],
  );
  return rows;
}

async function emailOf(userId: number) {
  const { rows } = await pool!.query<{ email: string }>(
    "SELECT email FROM users WHERE id = $1",
    [userId],
  );
  return rows[0]!.email;
}

async function campaignStatus(campaignId: number) {
  const { rows } = await pool!.query<{ status: string; completed: boolean }>(
    `SELECT status, completed_at IS NOT NULL AS completed
     FROM notification_campaigns WHERE id = $1`,
    [campaignId],
  );
  return rows[0]!;
}

/** Waits until the session with this pid is waiting on a lock. */
async function waitUntilWaiting(pid: number) {
  for (let attempt = 0; ; attempt += 1) {
    const { rows } = await pool!.query<{ waiting: boolean }>(
      "SELECT cardinality(pg_blocking_pids($1)) > 0 AS waiting",
      [pid],
    );
    if (rows[0]!.waiting) return;
    if (attempt > 250) throw new Error("It never waited.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Waits until some session is blocked by the one with this pid. */
async function waitUntilBlockedBy(pid: number) {
  for (let attempt = 0; ; attempt += 1) {
    const { rows } = await pool!.query<{ waiting: number }>(
      "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))",
      [pid],
    );
    if (rows[0]!.waiting > 0) return;
    if (attempt > 250) throw new Error("Nothing ever waited.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function deadlock() {
  return Object.assign(new Error("deadlock detected"), { code: "40P01" });
}

const LATER = () => Date.now() + 60_000;

describeDatabase("comunicado fan-out", () => {
  let consoleError: MockInstance<typeof console.error>;
  let consoleWarn: MockInstance<typeof console.warn>;
  let consoleLog: MockInstance<typeof console.log>;

  /** console.error lines a test expects, read and cleared. */
  function takeErrors() {
    const lines = consoleError.mock.calls.map((args) =>
      args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" "),
    );
    consoleError.mockClear();
    return lines;
  }

  /** The app's `db` logs every statement it runs as `{ query, params }`. */
  function statementsLogged() {
    return consoleLog.mock.calls.filter(
      ([first]) =>
        typeof first === "object" &&
        first !== null &&
        typeof (first as { query?: unknown }).query === "string",
    ).length;
  }

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    process.env.NEXT_PUBLIC_BASE_URL = "https://glitter.test";
    fanout = await import("@/app/lib/comunicados/fanout");
    notify = await import("@/app/lib/notifications/notify");
    appDb = (await import("@/db")).db;

    // The fan-out writes through the app's pool: it must be this database.
    const { rows } = await appDb.execute<{ name: string }>(
      sql`SELECT current_database() AS name`,
    );
    expect(rows[0]?.name).toBe(
      decodeURIComponent(new URL(testDatabaseUrl!).pathname.slice(1)),
    );
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
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  async function cleanUp() {
    const db = integrationDb!;
    if (created.campaigns.length > 0) {
      await db
        .delete(notifications)
        .where(inArray(notifications.campaignId, created.campaigns));
    }
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
    if (created.deletions.length > 0) {
      await db
        .delete(pendingUserDeletions)
        .where(inArray(pendingUserDeletions.id, created.deletions));
    }
    if (created.users.length > 0) {
      // Their devices, inbox items and deliveries cascade.
      await db.delete(users).where(inArray(users.id, created.users));
    }
    for (const ids of Object.values(created)) ids.length = 0;
  }

  afterEach(async () => {
    // Read before cleanup, assert after it, so a failure still cleans up.
    const errors = takeErrors();
    const lines = JSON.stringify([
      ...consoleWarn.mock.calls,
      ...consoleLog.mock.calls.filter((args) =>
        String(args[0]).startsWith("[comunicados]"),
      ),
    ]);
    // Every statement the app ran, with its params: an address in any of
    // them would be in the logs.
    const statements = JSON.stringify(consoleLog.mock.calls);
    consoleError.mockRestore();
    consoleWarn.mockRestore();
    consoleLog.mockRestore();
    state.vercelEnv = "production";
    state.beforeNotifyMany = null;
    state.afterNotifyMany = null;
    await cleanUp();
    expect(errors).toEqual([]);
    expect(lines).not.toContain("@");
    expect(statements).not.toContain("@");
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    const { pool: appPool } = await import("@/db");
    await appPool.end();
  });

  describe("notifyMany", () => {
    const data = (comunicadoId: number) => ({
      comunicadoId,
      revision: 1,
      title: "Cambio de horario",
      excerpt: "El armado empieza a las 8.",
      actionPath: "/my_participations",
      actionLabel: "Ver mi participación",
    });

    async function notifyAll(
      fixture: SentFixture,
      userIds: readonly number[],
      opts: { email?: "bulk" | null; push?: boolean } = {},
    ) {
      return appDb.transaction((tx) =>
        notify.notifyMany(tx, {
          kind: "comunicado",
          data: data(fixture.comunicadoId),
          userIds,
          dedupeKey: `comunicado:${fixture.comunicadoId}`,
          campaignId: fixture.campaignId,
          email: opts.email === undefined ? "bulk" : opts.email,
          emailPayload: { comunicadoId: fixture.comunicadoId },
          push: opts.push ?? false,
        }),
      );
    }

    it("writes one item per person, and nothing new on a repeat", async () => {
      const [ana, beto] = [await createUser(), await createUser()];
      await addDevice(ana);
      const fixture = await insertSent({ people: [] });

      const first = await notifyAll(fixture, [beto, ana, ana], { push: true });
      expect([...first.notificationIdByUser.keys()].sort()).toEqual(
        [ana, beto].sort(),
      );
      expect(first.createdUserIds).toEqual([ana, beto].sort((a, b) => a - b));
      expect(first.emailDeliveryIds).toHaveLength(2);
      expect(first.pushDeliveryIds).toHaveLength(1);

      const again = await notifyAll(fixture, [ana, beto], { push: true });
      expect(again.notificationIdByUser).toEqual(first.notificationIdByUser);
      expect(again.createdUserIds).toEqual([]);
      expect(again.emailDeliveryIds).toEqual([]);
      expect(again.pushDeliveryIds).toEqual([]);

      const items = await itemsOf(fixture.campaignId);
      expect(items).toHaveLength(2);
      for (const item of items) {
        expect(item).toMatchObject({
          kind: "comunicado",
          category: "announcements",
          title: "Cambio de horario",
          body: "El armado empieza a las 8.",
          action_path: "/my_participations",
          action_label: "Ver mi participación",
          data: data(fixture.comunicadoId),
          dedupe_key: `comunicado:${fixture.comunicadoId}`,
          read: false,
        });
      }
      expect(await deliveriesOf(fixture.campaignId)).toHaveLength(3);
    });

    it("leaves out someone who is gone", async () => {
      const ana = await createUser();
      const fixture = await insertSent({ people: [] });

      const result = await notifyAll(fixture, [ana, MISSING_ID]);
      expect([...result.notificationIdByUser.keys()]).toEqual([ana]);
      expect(result.createdUserIds).toEqual([ana]);
      expect(await itemsOf(fixture.campaignId)).toHaveLength(1);
    });

    it("queues each new item's email on the bulk lane, with the address read from the profile", async () => {
      const ana = await createUser();
      const fixture = await insertSent({ people: [] });

      const result = await notifyAll(fixture, [ana]);
      const notificationId = result.notificationIdByUser.get(ana)!;
      expect(await deliveriesOf(fixture.campaignId)).toEqual([
        {
          id: result.emailDeliveryIds[0],
          notification_id: notificationId,
          user_id: ana,
          template_key: "comunicado",
          channel: "email",
          lane: "bulk",
          status: "pending",
          recipient_email: await emailOf(ana),
          push_subscription_id: null,
          payload: { comunicadoId: fixture.comunicadoId },
          idempotency_key: `notification:${notificationId}:email`,
          batch_key: null,
          maybe_sent: false,
          content_revision: null,
        },
      ]);
    });

    it("queues no email unless asked, though the kind has no email of its own", async () => {
      const ana = await createUser();
      const fixture = await insertSent({ people: [] });

      const result = await notifyAll(fixture, [ana], { email: null });
      expect(result.emailDeliveryIds).toEqual([]);
      expect(await deliveriesOf(fixture.campaignId)).toEqual([]);
    });

    it("pushes to each device only when the sender asked", async () => {
      const [ana, beto] = [await createUser(), await createUser()];
      const devices = [await addDevice(ana), await addDevice(ana)];
      const fixture = await insertSent({ people: [] });

      const silent = await notifyAll(fixture, [beto], { push: false });
      expect(silent.pushDeliveryIds).toEqual([]);
      await addDevice(beto);
      // Beto already has the item: no push for him on a repeat either.
      const result = await notifyAll(fixture, [ana, beto], { push: true });
      const notificationId = result.notificationIdByUser.get(ana)!;
      const pushes = (await deliveriesOf(fixture.campaignId)).filter(
        (row) => row.channel === "push",
      );
      expect(pushes.map((row) => row.id).sort()).toEqual(
        [...result.pushDeliveryIds].sort(),
      );
      expect(pushes).toEqual(
        devices.map((deviceId) =>
          expect.objectContaining({
            notification_id: notificationId,
            user_id: ana,
            template_key: "comunicado",
            lane: "bulk",
            status: "pending",
            recipient_email: null,
            push_subscription_id: deviceId,
            payload: {},
            idempotency_key: `notification:${notificationId}:push:${deviceId}`,
          }),
        ),
      );
    });

    it("refuses data its kind cannot read, writing nothing", async () => {
      const ana = await createUser();
      const fixture = await insertSent({ people: [] });

      await expect(
        appDb.transaction((tx) =>
          notify.notifyMany(tx, {
            kind: "comunicado",
            data: { ...data(fixture.comunicadoId), title: "" },
            userIds: [ana],
            dedupeKey: `comunicado:${fixture.comunicadoId}`,
            campaignId: fixture.campaignId,
            email: "bulk",
          }),
        ),
      ).rejects.toThrow("notification_data_invalid:comunicado");
      expect(await itemsOf(fixture.campaignId)).toEqual([]);
    });
  });

  describe("a chunk", () => {
    it("notifies from the current revision and queues email and push, with ids and counts in its log", async () => {
      const [ana, beto, admin] = [
        await createUser(),
        await createUser("user", "paused"),
        await createUser("admin"),
      ];
      const anaDevice = await addDevice(ana);
      const fixture = await insertSent({
        people: [
          { userId: ana, source: "list" },
          { userId: beto, source: "person" },
          { userId: admin, source: "person" },
        ],
        sendPush: true,
        revisions: 2,
        action: { label: "Ver horarios", path: "/my_participations" },
      });

      const outcome = await fanout.processComunicadoChunk(
        fixture.campaignId,
        fixture.comunicadoId,
        new Set(),
      );
      expect(outcome).toMatchObject({
        kind: "processed",
        notified: 3,
        skipped: 0,
        contended: [],
      });

      const items = await itemsOf(fixture.campaignId);
      expect(items.map((item) => item.user_id).sort()).toEqual(
        [ana, beto, admin].sort(),
      );
      expect(items[0]!.data).toEqual({
        comunicadoId: fixture.comunicadoId,
        revision: 2,
        title: "Revisión 2",
        excerpt: "Texto de la revisión 2. Segundo párrafo.",
        actionPath: "/my_participations",
        actionLabel: "Ver horarios",
      });
      const recipients = await recipientsOf(fixture.campaignId);
      for (const userId of [ana, beto, admin]) {
        const item = items.find((row) => row.user_id === userId)!;
        expect(recipients.get(userId)).toMatchObject({
          status: "notified",
          notification_id: item.id,
          attempts: 1,
          processed: true,
          skipped_reason: null,
        });
      }

      const deliveries = await deliveriesOf(fixture.campaignId);
      expect(deliveries.filter((row) => row.channel === "email")).toHaveLength(
        3,
      );
      const pushes = deliveries.filter((row) => row.channel === "push");
      expect(pushes).toEqual([
        expect.objectContaining({
          user_id: ana,
          push_subscription_id: anaDevice,
          lane: "bulk",
        }),
      ]);
      if (outcome.kind === "processed") {
        expect(outcome.pushDeliveryIds).toEqual(pushes.map((row) => row.id));
      }
      // Completing is the driver's step, not the chunk's.
      expect((await campaignStatus(fixture.campaignId)).status).toBe(
        "processing",
      );
      expect(consoleLog).toHaveBeenCalledWith("[comunicados] chunk", {
        campaignId: fixture.campaignId,
        notified: 3,
        skipped: 0,
        ms: expect.any(Number),
      });
    });

    it("writes no email when email was not ticked", async () => {
      const ana = await createUser();
      const fixture = await insertSent({
        people: [{ userId: ana, source: "list" }],
        sendEmail: false,
      });

      await fanout.processComunicadoChunk(
        fixture.campaignId,
        fixture.comunicadoId,
        new Set(),
      );
      expect(await itemsOf(fixture.campaignId)).toHaveLength(1);
      expect(await deliveriesOf(fixture.campaignId)).toEqual([]);
    });

    it("writes no push when push was not ticked, though the person has a device", async () => {
      const ana = await createUser();
      await addDevice(ana);
      const fixture = await insertSent({
        people: [{ userId: ana, source: "list" }],
        sendPush: false,
      });

      const outcome = await fanout.processComunicadoChunk(
        fixture.campaignId,
        fixture.comunicadoId,
        new Set(),
      );
      expect(outcome).toMatchObject({
        kind: "processed",
        notified: 1,
        skipped: 0,
        pushDeliveryIds: [],
      });
      const items = await itemsOf(fixture.campaignId);
      expect(items.map((item) => item.user_id)).toEqual([ana]);
      const deliveries = await deliveriesOf(fixture.campaignId);
      expect(deliveries).toEqual([
        expect.objectContaining({
          notification_id: items[0]!.id,
          user_id: ana,
          channel: "email",
        }),
      ]);
      expect(deliveries.filter((row) => row.channel === "push")).toEqual([]);
    });

    it("judges everyone again under the locks, so whatever changed since the send leaves them skipped", async () => {
      const people = {
        ok: await createUser(),
        bannedSince: await createUser(),
        deletingSince: await createUser(),
        unverified: await createUser("user", "pending"),
        festivalAdmin: await createUser("festival_admin"),
        formerAdmin: await createUser("user"),
        bannedAdmin: await createUser("admin", "banned"),
        noSource: await createUser(),
      };
      const fixture = await insertSent({
        people: [
          { userId: people.ok, source: "list" },
          { userId: people.bannedSince, source: "list" },
          { userId: people.deletingSince, source: "person" },
          { userId: people.unverified, source: "list" },
          { userId: people.festivalAdmin, source: "person" },
          { userId: people.formerAdmin, source: "staging_admin" },
          { userId: people.bannedAdmin, source: "person" },
          { userId: people.noSource, source: null },
        ],
      });
      await pool!.query("UPDATE users SET status = 'banned' WHERE id = $1", [
        people.bannedSince,
      ]);
      await markDeleting(people.deletingSince);

      const outcome = await fanout.processComunicadoChunk(
        fixture.campaignId,
        fixture.comunicadoId,
        new Set(),
      );
      expect(outcome).toMatchObject({ notified: 1, skipped: 7 });

      const recipients = await recipientsOf(fixture.campaignId);
      const reasons = Object.fromEntries(
        Object.entries(people).map(([name, id]) => [
          name,
          recipients.get(id)!.skipped_reason,
        ]),
      );
      expect(reasons).toEqual({
        ok: null,
        bannedSince: "Cuenta suspendida",
        deletingSince: "Cuenta en eliminación",
        unverified: "Perfil no verificado",
        festivalAdmin: NOT_PARTICIPANT,
        formerAdmin: NOT_PARTICIPANT,
        bannedAdmin: NOT_PARTICIPANT,
        noSource: NOT_PARTICIPANT,
      });
      for (const [name, id] of Object.entries(people)) {
        expect(recipients.get(id)).toMatchObject(
          name === "ok"
            ? { status: "notified", processed: true }
            : { status: "skipped", processed: true, notification_id: null },
        );
      }
      expect((await itemsOf(fixture.campaignId)).map((i) => i.user_id)).toEqual(
        [people.ok],
      );
    });

    it("outside production reaches only people picked by name and the admins, by its own environment", async () => {
      state.vercelEnv = "preview";
      const [member, picked, admin, noSource] = [
        await createUser(),
        await createUser(),
        await createUser("admin"),
        await createUser(),
      ];
      for (const userId of [member, picked, admin, noSource]) {
        await addDevice(userId);
      }
      // Written by production, drained here: the row's own source decides.
      const fixture = await insertSent({
        people: [
          { userId: member, source: "list" },
          { userId: picked, source: "person" },
          { userId: admin, source: "staging_admin" },
          { userId: noSource, source: null },
        ],
        sendPush: true,
      });

      const run = await fanout.fanOutComunicado({
        campaignId: fixture.campaignId,
        comunicadoId: fixture.comunicadoId,
        deadline: LATER(),
      });
      expect(run).toMatchObject({ notified: 2, skipped: 2, stopped: "done" });

      const recipients = await recipientsOf(fixture.campaignId);
      expect(recipients.get(member)).toMatchObject({
        status: "skipped",
        skipped_reason: STAGING,
      });
      expect(recipients.get(noSource)).toMatchObject({
        status: "skipped",
        skipped_reason: NOT_PARTICIPANT,
      });
      expect(recipients.get(picked)!.status).toBe("notified");
      expect(recipients.get(admin)!.status).toBe("notified");
      const reached = [picked, admin].sort();
      expect(
        (await itemsOf(fixture.campaignId)).map((i) => i.user_id).sort(),
      ).toEqual(reached);
      const deliveries = await deliveriesOf(fixture.campaignId);
      expect([...new Set(deliveries.map((d) => d.user_id))].sort()).toEqual(
        reached,
      );
      expect(deliveries.filter((d) => d.channel === "push")).toHaveLength(2);
    });

    it("stops at a retraction and writes nothing", async () => {
      const ana = await createUser();
      const fixture = await insertSent({
        people: [{ userId: ana, source: "list" }],
      });
      await pool!.query(
        `UPDATE comunicados SET retracted_at = now(), retract_reason = 'Error'
         WHERE id = $1`,
        [fixture.comunicadoId],
      );

      expect(
        await fanout.processComunicadoChunk(
          fixture.campaignId,
          fixture.comunicadoId,
          new Set(),
        ),
      ).toEqual({ kind: "retracted" });
      const run = await fanout.fanOutComunicado({
        campaignId: fixture.campaignId,
        comunicadoId: fixture.comunicadoId,
        deadline: LATER(),
      });
      expect(run).toMatchObject({ chunks: 0, stopped: "retracted" });
      expect(await itemsOf(fixture.campaignId)).toEqual([]);
      expect(await recipientsOf(fixture.campaignId)).toEqual(
        new Map([[ana, expect.objectContaining({ status: "pending" })]]),
      );

      // Named rows meet the retraction too, once the retraction skipped them.
      const recipientId = fixture.recipients.get(ana)!;
      await pool!.query(
        `UPDATE notification_campaign_recipients
         SET status = 'skipped', skipped_reason = 'Retirado antes de enviarse'
         WHERE id = $1`,
        [recipientId],
      );
      expect(
        await fanout.processComunicadoChunk(
          fixture.campaignId,
          fixture.comunicadoId,
          new Set(),
          { candidateIds: [recipientId] },
        ),
      ).toEqual({ kind: "retracted" });
    });

    it("refuses a comunicado that is not the campaign's, writing nothing", async () => {
      const ana = await createUser();
      const fixture = await insertSent({
        people: [{ userId: ana, source: "list" }],
      });
      const other = await insertSent({ people: [] });

      await expect(
        fanout.processComunicadoChunk(
          fixture.campaignId,
          other.comunicadoId,
          new Set(),
        ),
      ).rejects.toThrow("comunicado_not_found");
      expect(await itemsOf(fixture.campaignId)).toEqual([]);
      expect((await recipientsOf(fixture.campaignId)).get(ana)).toMatchObject({
        status: "pending",
        attempts: 0,
      });
    });

    it("passes over rows another runner holds, and finishes the rest", async () => {
      const [held, free] = [await createUser(), await createUser()];
      const fixture = await insertSent({
        people: [
          { userId: held, source: "list" },
          { userId: free, source: "list" },
        ],
      });
      const heldId = fixture.recipients.get(held)!;

      const other = await pool!.connect();
      try {
        await other.query("BEGIN");
        await other.query(
          "SELECT id FROM notification_campaign_recipients WHERE id = $1 FOR UPDATE",
          [heldId],
        );
        const running = fanout.fanOutComunicado({
          campaignId: fixture.campaignId,
          comunicadoId: fixture.comunicadoId,
          deadline: LATER(),
        });
        // A runner that waited for the row instead would never finish while
        // the other holds it: let go after a while, so the test fails, not hangs.
        const first = await Promise.race([
          running,
          new Promise<"waiting">((resolve) =>
            setTimeout(() => resolve("waiting"), 5_000),
          ),
        ]);
        await other.query("COMMIT");
        expect(first).not.toBe("waiting");
        expect(await running).toMatchObject({
          chunks: 1,
          notified: 1,
          stopped: "done",
        });
      } catch (error) {
        await other.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        other.release();
      }
      const recipients = await recipientsOf(fixture.campaignId);
      expect(recipients.get(held)).toMatchObject({
        status: "pending",
        attempts: 0,
      });
      expect(recipients.get(free)!.status).toBe("notified");
    });

    it("waits for a profile deletion holding the person, then leaves them out", async () => {
      const [doomed, staying] = [await createUser(), await createUser()];
      const fixture = await insertSent({
        people: [
          { userId: doomed, source: "list" },
          { userId: staying, source: "list" },
        ],
      });

      // The deletion takes the user first (`app/api/users/actions.ts`).
      const deletion = await pool!.connect();
      let run: Awaited<ReturnType<Fanout["fanOutComunicado"]>>;
      try {
        await deletion.query("BEGIN");
        const {
          rows: [{ pid }],
        } = await deletion.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid",
        );
        await deletion.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [
          doomed,
        ]);
        const running = fanout.fanOutComunicado({
          campaignId: fixture.campaignId,
          comunicadoId: fixture.comunicadoId,
          deadline: LATER(),
        });
        await waitUntilBlockedBy(pid);
        await deletion.query("DELETE FROM users WHERE id = $1", [doomed]);
        await deletion.query("COMMIT");
        run = await running;
      } catch (error) {
        await deletion.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        deletion.release();
      }

      expect(run).toMatchObject({ notified: 1, failed: 0, stopped: "done" });
      const recipients = await recipientsOf(fixture.campaignId);
      expect(recipients.has(doomed)).toBe(false);
      expect(recipients.get(staying)!.status).toBe("notified");
      expect((await itemsOf(fixture.campaignId)).map((i) => i.user_id)).toEqual(
        [staying],
      );
    });

    it("holds off a profile deletion until it commits, which then takes the person's rows with them", async () => {
      const [doomed, staying] = [await createUser(), await createUser()];
      const fixture = await insertSent({
        people: [
          { userId: doomed, source: "list" },
          { userId: staying, source: "list" },
        ],
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let inChunk!: () => void;
      const reached = new Promise<void>((resolve) => (inChunk = resolve));
      state.beforeNotifyMany = async () => {
        inChunk();
        await gate;
      };

      const running = fanout.fanOutComunicado({
        campaignId: fixture.campaignId,
        comunicadoId: fixture.comunicadoId,
        deadline: LATER(),
      });
      await reached;
      const deletion = await pool!.connect();
      try {
        const {
          rows: [{ pid }],
        } = await deletion.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid",
        );
        const deleting = deletion.query("DELETE FROM users WHERE id = $1", [
          doomed,
        ]);
        await waitUntilWaiting(pid);
        release();
        const run = await running;
        await deleting;
        expect(run).toMatchObject({ notified: 2, stopped: "done" });
      } finally {
        release();
        deletion.release();
      }

      const recipients = await recipientsOf(fixture.campaignId);
      expect(recipients.has(doomed)).toBe(false);
      expect(recipients.get(staying)!.status).toBe("notified");
      const items = await itemsOf(fixture.campaignId);
      expect(items.map((i) => i.user_id)).toEqual([staying]);
      expect(
        (await deliveriesOf(fixture.campaignId)).map((d) => d.user_id),
      ).toEqual([staying]);
    });
  });

  describe("fanOutComunicado", () => {
    it("resumes a chunk that crashed without writing anything twice", async () => {
      const people = [
        await createUser(),
        await createUser(),
        await createUser(),
      ];
      const fixture = await insertSent({
        people: people.map((userId) => ({ userId, source: "list" })),
      });
      // The inbox rows are written, then the process dies before the commit.
      state.afterNotifyMany = () => {
        state.afterNotifyMany = null;
        throw new Error("process_crashed");
      };
      await expect(
        fanout.processComunicadoChunk(
          fixture.campaignId,
          fixture.comunicadoId,
          new Set(),
        ),
      ).rejects.toThrow("process_crashed");
      expect(await itemsOf(fixture.campaignId)).toEqual([]);
      expect(await deliveriesOf(fixture.campaignId)).toEqual([]);
      for (const row of (await recipientsOf(fixture.campaignId)).values()) {
        expect(row).toMatchObject({ status: "pending", attempts: 0 });
      }

      const run = await fanout.fanOutComunicado({
        campaignId: fixture.campaignId,
        comunicadoId: fixture.comunicadoId,
        deadline: LATER(),
      });
      expect(run).toMatchObject({ chunks: 1, notified: 3, stopped: "done" });
      const items = await itemsOf(fixture.campaignId);
      expect(items.map((i) => i.user_id).sort()).toEqual([...people].sort());
      const deliveries = await deliveriesOf(fixture.campaignId);
      expect(deliveries.map((d) => d.user_id).sort()).toEqual(
        [...people].sort(),
      );
      // A second run finds nothing to do.
      expect(
        await fanout.fanOutComunicado({
          campaignId: fixture.campaignId,
          comunicadoId: fixture.comunicadoId,
          deadline: LATER(),
        }),
      ).toMatchObject({ chunks: 0, notified: 0, stopped: "done" });
      expect(await itemsOf(fixture.campaignId)).toHaveLength(3);
    });

    it("spends no attempt on a transient error, and retries the chunk once", async () => {
      const people = [await createUser(), await createUser()];
      const fixture = await insertSent({
        people: people.map((userId) => ({ userId, source: "list" })),
      });
      state.beforeNotifyMany = () => {
        state.beforeNotifyMany = null;
        throw deadlock();
      };

      const run = await fanout.fanOutComunicado({
        campaignId: fixture.campaignId,
        comunicadoId: fixture.comunicadoId,
        deadline: LATER(),
      });
      expect(run).toMatchObject({ notified: 2, failed: 0, stopped: "done" });
      for (const row of (await recipientsOf(fixture.campaignId)).values()) {
        // The one attempt is the notification itself (D2 step 8).
        expect(row).toMatchObject({
          status: "notified",
          attempts: 1,
          last_error: null,
        });
      }
      expect(consoleWarn).toHaveBeenCalledWith(
        "[comunicados] chunk rolled back: database error",
        { campaignId: fixture.campaignId, errorType: "Error", code: "40P01" },
      );
    });

    it("leaves the rest for the next run after a second transient error", async () => {
      const people = [await createUser(), await createUser()];
      const fixture = await insertSent({
        people: people.map((userId) => ({ userId, source: "list" })),
      });
      state.beforeNotifyMany = () => {
        throw deadlock();
      };

      const run = await fanout.fanOutComunicado({
        campaignId: fixture.campaignId,
        comunicadoId: fixture.comunicadoId,
        deadline: LATER(),
      });
      expect(run).toMatchObject({ chunks: 0, failed: 0, stopped: "transient" });
      for (const row of (await recipientsOf(fixture.campaignId)).values()) {
        expect(row).toMatchObject({
          status: "pending",
          attempts: 0,
          last_error: null,
        });
      }
      expect(await itemsOf(fixture.campaignId)).toEqual([]);
    });

    it("isolates a row that keeps failing: it fails alone at three attempts", async () => {
      const [poison, ana, beto] = [
        await createUser(),
        await createUser(),
        await createUser(),
      ];
      const fixture = await insertSent({
        people: [poison, ana, beto].map((userId) => ({
          userId,
          source: "list",
        })),
      });
      // Its message names an address: last_error and the logs must not.
      state.beforeNotifyMany = (userIds) => {
        if (userIds.includes(poison)) {
          throw new Error(`could not notify poison@example.test`);
        }
      };

      const first = await fanout.fanOutComunicado({
        campaignId: fixture.campaignId,
        comunicadoId: fixture.comunicadoId,
        deadline: LATER(),
      });
      expect(first).toMatchObject({ notified: 2, failed: 0, stopped: "done" });
      let recipients = await recipientsOf(fixture.campaignId);
      // One attempt for the chunk, one for its own try.
      expect(recipients.get(poison)).toMatchObject({
        status: "pending",
        attempts: 2,
        last_error: "Error",
        processed: false,
      });
      for (const userId of [ana, beto]) {
        // The chunk's attempt, then the notification.
        expect(recipients.get(userId)).toMatchObject({
          status: "notified",
          attempts: 2,
        });
      }
      let errors = takeErrors();
      expect(errors).toEqual([
        expect.stringContaining("[comunicados] chunk failed"),
        expect.stringContaining("[comunicados] recipient failed"),
      ]);
      expect(errors.join(" ")).not.toContain("@");

      const second = await fanout.fanOutComunicado({
        campaignId: fixture.campaignId,
        comunicadoId: fixture.comunicadoId,
        deadline: LATER(),
      });
      expect(second).toMatchObject({ notified: 0, failed: 1, stopped: "done" });
      recipients = await recipientsOf(fixture.campaignId);
      expect(recipients.get(poison)).toMatchObject({
        status: "failed",
        attempts: 3,
        last_error: "Error",
        processed: true,
        notification_id: null,
      });
      errors = takeErrors();
      expect(errors).toEqual([
        expect.stringContaining("[comunicados] chunk failed"),
      ]);
      expect(errors.join(" ")).not.toContain("@");
      expect(
        (await itemsOf(fixture.campaignId)).map((i) => i.user_id).sort(),
      ).toEqual([ana, beto].sort());
      // Nothing is pending any more, so a third run has nothing to do.
      expect(
        await fanout.fanOutComunicado({
          campaignId: fixture.campaignId,
          comunicadoId: fixture.comunicadoId,
          deadline: LATER(),
        }),
      ).toMatchObject({ chunks: 0, stopped: "done" });
    });

    it("starts a chunk only with five seconds of the run left", async () => {
      const people = await Promise.all(
        Array.from({ length: 251 }, () => createUser()),
      );
      const fixture = await insertSent({
        people: people.map((userId) => ({ userId, source: "list" })),
      });
      let clock = 0;
      const now = () => clock;

      expect(
        await fanout.fanOutComunicado({
          campaignId: fixture.campaignId,
          comunicadoId: fixture.comunicadoId,
          deadline: 4_999,
          now,
        }),
      ).toMatchObject({ chunks: 0, stopped: "deadline" });

      // The first chunk takes the clock to 1 s before the reserve.
      state.afterNotifyMany = () => {
        clock = 96_000;
      };
      const run = await fanout.fanOutComunicado({
        campaignId: fixture.campaignId,
        comunicadoId: fixture.comunicadoId,
        deadline: 100_000,
        now,
      });
      expect(run).toMatchObject({
        chunks: 1,
        notified: 250,
        stopped: "deadline",
      });
      const pending = [...(await recipientsOf(fixture.campaignId)).values()]
        .filter((row) => row.status === "pending")
        .map((row) => row.user_id);
      // Chunks go in user id order.
      expect(pending).toEqual([Math.max(...people)]);
    });

    it("fans 2,000 people out in eight chunks, in a bounded number of statements", async () => {
      const suffix = randomUUID();
      const { rows: generated } = await pool!.query<{ id: number }>(
        `INSERT INTO users (clerk_id, email, display_name, role, status)
         SELECT 'fanout-bulk-' || $1 || '-' || g,
                'fanout-bulk-' || $1 || '-' || g || '@example.com',
                'Masivo ' || g, 'user', 'verified'
         FROM generate_series(1, 2000) AS g
         RETURNING id`,
        [suffix],
      );
      const ids = generated.map((row) => row.id);
      created.users.push(...ids);
      const fixture = await insertSent({
        people: ids.map((userId) => ({ userId, source: "list" })),
      });

      consoleLog.mockClear();
      const run = await fanout.fanOutComunicado({
        campaignId: fixture.campaignId,
        comunicadoId: fixture.comunicadoId,
        deadline: Date.now() + 60_000,
      });

      expect(run).toMatchObject({
        chunks: 8,
        notified: 2_000,
        skipped: 0,
        failed: 0,
        stopped: "done",
      });
      // About a dozen per chunk, whatever the chunk's size (D2).
      expect(statementsLogged()).toBeLessThanOrEqual(8 * 14 + 10);
      const { rows } = await pool!.query<{
        notified: number;
        items: number;
        emails: number;
      }>(
        `SELECT
           (SELECT count(*) FROM notification_campaign_recipients
            WHERE campaign_id = $1 AND status = 'notified')::int AS notified,
           (SELECT count(*) FROM notifications WHERE campaign_id = $1)::int AS items,
           (SELECT count(*) FROM notification_deliveries d
            JOIN notifications n ON n.id = d.notification_id
            WHERE n.campaign_id = $1 AND d.channel = 'email')::int AS emails`,
        [fixture.campaignId],
      );
      expect(rows[0]).toEqual({ notified: 2_000, items: 2_000, emails: 2_000 });
    }, 60_000);
  });

  describe("fanOutPendingComunicados", () => {
    it("takes only its own environment's campaigns that still have someone pending", async () => {
      const [previewPerson, productionPerson, donePerson] = [
        await createUser(),
        await createUser(),
        await createUser(),
      ];
      const preview = await insertSent({
        people: [{ userId: previewPerson, source: "person" }],
        env: "preview",
        createdAt: LONG_AGO,
      });
      const production = await insertSent({
        people: [{ userId: productionPerson, source: "person" }],
        env: "production",
        createdAt: LONG_AGO,
      });
      const done = await insertSent({
        people: [{ userId: donePerson, source: "person" }],
        env: "preview",
        createdAt: LONG_AGO,
      });
      await fanout.fanOutComunicado({
        campaignId: done.campaignId,
        comunicadoId: done.comunicadoId,
        deadline: LATER(),
      });

      state.vercelEnv = "preview";
      const run = await fanout.fanOutPendingComunicados({
        env: "preview",
        deadline: LATER(),
      });
      expect(run.campaignIds).toContain(preview.campaignId);
      expect(run.campaignIds).not.toContain(production.campaignId);
      expect(run.campaignIds).not.toContain(done.campaignId);
      expect(
        (await recipientsOf(preview.campaignId)).get(previewPerson)!.status,
      ).toBe("notified");
      expect(
        (await recipientsOf(production.campaignId)).get(productionPerson),
      ).toMatchObject({ status: "pending", attempts: 0 });
      expect(await itemsOf(production.campaignId)).toEqual([]);
    });

    it("takes at most `limit` campaigns, oldest first, and none past the deadline", async () => {
      const [first, second] = [await createUser(), await createUser()];
      const older = await insertSent({
        people: [{ userId: first, source: "person" }],
        env: "development",
        createdAt: "2000-01-01T00:00:00Z",
      });
      const newer = await insertSent({
        people: [{ userId: second, source: "person" }],
        env: "development",
        createdAt: "2000-01-02T00:00:00Z",
      });
      state.vercelEnv = "development";

      expect(
        await fanout.fanOutPendingComunicados({
          env: "development",
          deadline: Date.now() + 4_000,
        }),
      ).toMatchObject({ campaignIds: [], chunks: 0, stopped: "deadline" });

      const run = await fanout.fanOutPendingComunicados({
        env: "development",
        deadline: LATER(),
        limit: 1,
      });
      expect(run).toMatchObject({
        campaignIds: [older.campaignId],
        notified: 1,
        stopped: "done",
      });
      expect((await recipientsOf(newer.campaignId)).get(second)!.status).toBe(
        "pending",
      );
    });
  });

  describe("completion", () => {
    async function setEmails(campaignId: number, status: string) {
      await pool!.query(
        `UPDATE notification_deliveries d SET status = $2::notification_delivery_status
         FROM notifications n
         WHERE n.id = d.notification_id AND n.campaign_id = $1 AND d.channel = 'email'`,
        [campaignId, status],
      );
    }

    it("closes a campaign only once nobody is pending and no email is queued or being sent", async () => {
      const ana = await createUser();
      await addDevice(ana);
      const fixture = await insertSent({
        people: [{ userId: ana, source: "list" }],
        sendPush: true,
      });

      expect(await fanout.completeComunicadoCampaign(fixture.campaignId)).toBe(
        false,
      );
      await fanout.fanOutComunicado({
        campaignId: fixture.campaignId,
        comunicadoId: fixture.comunicadoId,
        deadline: LATER(),
      });
      // Notified, but the email is still queued.
      expect(await fanout.completeComunicadoCampaign(fixture.campaignId)).toBe(
        false,
      );
      await setEmails(fixture.campaignId, "processing");
      expect(await fanout.completeComunicadoCampaign(fixture.campaignId)).toBe(
        false,
      );
      expect(await campaignStatus(fixture.campaignId)).toEqual({
        status: "processing",
        completed: false,
      });

      // The push is still pending: it is not waited for.
      await setEmails(fixture.campaignId, "sent");
      expect(await fanout.completeComunicadoCampaign(fixture.campaignId)).toBe(
        true,
      );
      expect(await campaignStatus(fixture.campaignId)).toEqual({
        status: "completed",
        completed: true,
      });
      expect(await fanout.completeComunicadoCampaign(fixture.campaignId)).toBe(
        false,
      );
    });

    it("closes in the caller's transaction, and never a gift's campaign", async () => {
      const fixture = await insertSent({ people: [] });
      const rolledBack = appDb.transaction(async (tx) => {
        expect(
          await fanout.completeComunicadoIfDone(tx, fixture.campaignId),
        ).toBe(true);
        tx.rollback();
      });
      await expect(rolledBack).rejects.toThrow();
      expect((await campaignStatus(fixture.campaignId)).status).toBe(
        "processing",
      );

      const gift = await pool!.query<{ id: number }>(
        `INSERT INTO notification_campaigns (type, status, title, message, idempotency_key)
         VALUES ('credit_gift', 'processing', 'Regalo', 'Gracias', $1)
         RETURNING id`,
        [randomUUID()],
      );
      created.campaigns.push(gift.rows[0]!.id);
      expect(await fanout.completeComunicadoCampaign(gift.rows[0]!.id)).toBe(
        false,
      );
      expect((await campaignStatus(gift.rows[0]!.id)).status).toBe(
        "processing",
      );
    });

    it("sweeps up a finished campaign and leaves an unfinished one", async () => {
      const ana = await createUser();
      const finished = await insertSent({
        people: [],
        env: "preview",
        createdAt: LONG_AGO,
      });
      const unfinished = await insertSent({
        people: [{ userId: ana, source: "list" }],
        createdAt: LONG_AGO,
      });

      // Whichever environment sent them: closing one sends nothing.
      const result = await fanout.sweepComunicadoCompletions({ limit: 50 });
      expect(result.checked).toBeGreaterThanOrEqual(2);
      expect(result.completed).toBeGreaterThanOrEqual(1);
      expect((await campaignStatus(finished.campaignId)).status).toBe(
        "completed",
      );
      expect((await campaignStatus(unfinished.campaignId)).status).toBe(
        "processing",
      );
    });
  });
});
