// @vitest-environment node

import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
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

import type { ComunicadoAudienceSummary } from "@/app/lib/comunicados/definitions";
import type { BulkTiming } from "@/app/lib/notifications/bulk-email";
import * as schema from "@/db/schema";

/**
 * "Reintentar fallidos" against a real database
 * (docs/IMPLEMENTATION-comunicados.md G6, F4, V7): what it reopens, the
 * email rows it writes and the ones it never picks, the campaign it reopens
 * and the run that closes it again, and how it meets a retraction, a second
 * retry and a completion. The fan-out, the bulk lane and the driver are
 * real; Resend is mocked, and there are no VAPID keys, so nothing leaves the
 * test. Every assertion is about this file's own rows.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
const afterMock = vi.hoisted(() => vi.fn());
vi.mock("next/server", () => ({ after: afterMock }));
// The one network call: a batch to Resend.
const sendBatchMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
  sendBatchEmails: sendBatchMock,
}));
// No VAPID keys: the driver's push step claims nothing.
vi.mock("@/app/lib/notifications/push/config", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/app/lib/notifications/push/config")
  >()),
  pushVapidConfig: () => null,
  pushPublicKey: () => null,
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 6 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Retry = typeof import("@/app/lib/comunicados/retry");
type RetryActions = typeof import("@/app/lib/comunicados/retry-actions");
type Retract = typeof import("@/app/lib/comunicados/retract");
type Fanout = typeof import("@/app/lib/comunicados/fanout");
type Driver = typeof import("@/app/lib/comunicados/driver");
type AppDb = (typeof import("@/db"))["db"];
let retryMod: Retry;
let retryActions: RetryActions;
let retractMod: Retract;
let fanout: Fanout;
let driver: Driver;
let appDb: AppDb;

const BASE_URL = "https://glitter.test";
const COMUNICADO_LOCK_NS = 8155;
const MISSING_ID = 2_147_483_000;
const LATER = () => Date.now() + 60_000;
const TEXT = "El armado empieza a las 8:00.";
const RETRY_KEY = /^notification:(\d+):email:retry:[0-9a-f-]{36}$/;

/** No test waits on the production waits. */
const FAST: Partial<BulkTiming> = {
  spacingMs: 0,
  lockPollMs: 10,
  minLockTimeoutMs: 100,
  maxThrottleWaitMs: 10,
};

const created = {
  users: [] as number[],
  campaigns: [] as number[],
  comunicados: [] as number[],
  rateLimitKeys: [] as string[],
};

async function createUser(role: Role = "user") {
  const suffix = randomUUID();
  const { rows } = await pool!.query<{ id: number }>(
    `INSERT INTO users (clerk_id, email, display_name, role, status)
     VALUES ($1, $2, $3, $4, 'verified') RETURNING id`,
    [
      `retry-${suffix}`,
      `retry-${suffix}@example.test`,
      `Reintento ${suffix.slice(0, 8)}`,
      role,
    ],
  );
  created.users.push(rows[0]!.id);
  return rows[0]!.id;
}

/** Verified participants, in one statement. */
async function createPeople(count: number) {
  const { rows } = await pool!.query<{ id: number }>(
    `INSERT INTO users (clerk_id, email, display_name, role, status)
     SELECT 'retry-' || $1 || '-' || g,
            'retry-' || $1 || '-' || g || '@example.test',
            'Reintento ' || g, 'user', 'verified'
     FROM generate_series(1, $2::int) AS g
     RETURNING id`,
    [randomUUID(), count],
  );
  const ids = rows.map((row) => row.id);
  created.users.push(...ids);
  return ids;
}

function summaryFor(): ComunicadoAudienceSummary {
  return {
    v: 1,
    env: "production",
    narrowed: false,
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

type Sent = {
  campaignId: number;
  comunicadoId: number;
  authorId: number;
};

/**
 * A comunicado as the send leaves it: a processing campaign, the sent row,
 * revision 1, and one pending recipient per person, entered from a list.
 */
async function insertSent(people: number[]): Promise<Sent> {
  const authorId = await createUser("admin");
  const title = "Cambio de horario de armado";
  const campaign = await pool!.query<{ id: number }>(
    `INSERT INTO notification_campaigns
       (type, status, title, message, created_by_user_id, idempotency_key)
     VALUES ('comunicado', 'processing', $1, $2, $3, $4)
     RETURNING id`,
    [title, TEXT, authorId, `comunicado:retry-test-${randomUUID()}`],
  );
  const campaignId = campaign.rows[0]!.id;
  created.campaigns.push(campaignId);
  const comunicado = await pool!.query<{ id: number }>(
    `INSERT INTO comunicados
       (status, title, campaign_id, current_revision, sent_at, sent_by_user_id,
        audience_summary, send_email, created_by_user_id, updated_by_user_id)
     VALUES ('sent', $1, $2, 1, now(), $3, $4::jsonb, true, $3, $3)
     RETURNING id`,
    [title, campaignId, authorId, JSON.stringify(summaryFor())],
  );
  const comunicadoId = comunicado.rows[0]!.id;
  created.comunicados.push(comunicadoId);
  await pool!.query(
    `INSERT INTO comunicado_revisions
       (comunicado_id, revision, title, doc, html, text, created_by_user_id)
     VALUES ($1, 1, $2, $3::jsonb, $4, $5, $6)`,
    [
      comunicadoId,
      title,
      JSON.stringify([
        {
          type: "paragraph",
          props: {},
          content: [{ type: "text", text: TEXT, styles: {} }],
          children: [],
        },
      ]),
      `<p>${TEXT}</p>`,
      TEXT,
      authorId,
    ],
  );
  await pool!.query(
    `INSERT INTO notification_campaign_recipients
       (campaign_id, user_id, status, source)
     SELECT $1, t.user_id, 'pending', 'list'
     FROM unnest($2::int[]) AS t(user_id)`,
    [campaignId, people],
  );
  return { campaignId, comunicadoId, authorId };
}

/** Everyone pending becomes an inbox item, with its email row. */
async function fanOut(sent: Sent) {
  const run = await fanout.fanOutComunicado({
    campaignId: sent.campaignId,
    comunicadoId: sent.comunicadoId,
    deadline: LATER(),
  });
  expect(run.stopped).toBe("done");
}

/** A recipient the fan-out gave up on after its three attempts. */
async function addFailedRecipient(sent: Sent, userId: number) {
  await pool!.query(
    `INSERT INTO notification_campaign_recipients
       (campaign_id, user_id, status, source, attempts, last_error, processed_at)
     VALUES ($1, $2, 'failed', 'list', 3, 'Error', now())`,
    [sent.campaignId, userId],
  );
}

type EmailEnd =
  | "sent"
  | "failed"
  /** Failed after an attempt that may have reached Resend. */
  | "failed_maybe_sent"
  | "skipped"
  | "pending";

/** The person's latest email row, as the lane leaves it. */
async function settleEmail(sent: Sent, userId: number, end: EmailEnd) {
  const status = end === "failed_maybe_sent" ? "failed" : end;
  const { rowCount } = await pool!.query(
    `UPDATE notification_deliveries d
     SET status = $3::notification_delivery_status,
       last_error = CASE $3::text
         WHEN 'failed' THEN 'resend:validation_error'
         WHEN 'skipped' THEN 'unsubscribed' END,
       batch_key = CASE WHEN $3::text <> 'pending'
                        THEN 'comunicado-batch:retry-test:' || d.id END,
       maybe_sent_at = CASE WHEN $4 THEN now() END,
       sent_at = CASE WHEN $3::text = 'sent' THEN now() END,
       content_revision = CASE WHEN $3::text = 'sent' THEN 1 END,
       attempts = 1, updated_at = now()
     WHERE d.id = (
       SELECT d2.id FROM notification_deliveries d2
       JOIN notifications n ON n.id = d2.notification_id
       WHERE n.campaign_id = $1 AND d2.user_id = $2 AND d2.channel = 'email'
       ORDER BY d2.id DESC LIMIT 1)`,
    [sent.campaignId, userId, status, end === "failed_maybe_sent"],
  );
  expect(rowCount).toBe(1);
}

/** A later email row for the same item, as an earlier retry wrote it. */
async function addLaterEmail(sent: Sent, userId: number, end: EmailEnd) {
  await pool!.query(
    `INSERT INTO notification_deliveries
       (notification_id, user_id, template_key, channel, lane,
        recipient_email, payload, idempotency_key)
     SELECT n.id, n.user_id, 'comunicado', 'email', 'bulk', btrim(u.email),
            jsonb_build_object('comunicadoId', $3::int),
            'notification:' || n.id || ':email:retry:' || $4::text
     FROM notifications n JOIN users u ON u.id = n.user_id
     WHERE n.campaign_id = $1 AND n.user_id = $2`,
    [sent.campaignId, userId, sent.comunicadoId, randomUUID()],
  );
  await settleEmail(sent, userId, end);
}

async function complete(sent: Sent) {
  await pool!.query(
    `UPDATE notification_campaigns
     SET status = 'completed', completed_at = now() - interval '1 hour',
       updated_at = now()
     WHERE id = $1`,
    [sent.campaignId],
  );
}

async function campaignOf(sent: Sent) {
  const { rows } = await pool!.query<{
    status: string;
    completed_at: Date | null;
  }>(`SELECT status, completed_at FROM notification_campaigns WHERE id = $1`, [
    sent.campaignId,
  ]);
  return rows[0]!;
}

type EmailRow = {
  id: number;
  user_id: number;
  notification_id: number;
  status: string;
  lane: string;
  template_key: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  resend_of_delivery_id: number | null;
  requested_by_user_id: number | null;
  same_address: boolean;
  maybe_sent: boolean;
};

/** Every email row of the campaign, oldest first; the address compared in SQL. */
async function emailsOf(sent: Sent) {
  const { rows } = await pool!.query<EmailRow>(
    `SELECT d.id, d.user_id, d.notification_id, d.status, d.lane,
            d.template_key, d.payload, d.idempotency_key,
            d.resend_of_delivery_id, d.requested_by_user_id,
            d.recipient_email = btrim(u.email) AS same_address,
            d.maybe_sent_at IS NOT NULL AS maybe_sent
     FROM notification_deliveries d
     JOIN notifications n ON n.id = d.notification_id
     JOIN users u ON u.id = d.user_id
     WHERE n.campaign_id = $1 AND d.channel = 'email'
     ORDER BY d.id`,
    [sent.campaignId],
  );
  return rows;
}

function retryRows(emails: EmailRow[]) {
  return emails.filter((row) => RETRY_KEY.test(row.idempotency_key));
}

async function recipientOf(sent: Sent, userId: number) {
  const { rows } = await pool!.query<{
    status: string;
    attempts: number;
    last_error: string | null;
    processed: boolean;
    notification_id: number | null;
  }>(
    `SELECT status, attempts, last_error, processed_at IS NOT NULL AS processed,
            notification_id
     FROM notification_campaign_recipients
     WHERE campaign_id = $1 AND user_id = $2`,
    [sent.campaignId, userId],
  );
  return rows[0]!;
}

function retry(sent: Sent, by = sent.authorId) {
  return retryMod.retryFailedComunicado(sent.comunicadoId, by);
}

/** The campaign's own run, as the action's `after()` starts it. */
function drain(sent: Sent) {
  return driver.runComunicadoWork({
    scope: { campaignId: sent.campaignId },
    deadline: LATER(),
    trigger: "send",
    emailTiming: FAST,
  });
}

/**
 * A second connection holding a transaction open, for lock tests, and its
 * backend pid. Let go by `release`, or after `maxMs` so a failing test
 * cannot hang.
 */
async function holdTransaction(
  statement: string,
  params: unknown[] = [],
  maxMs = 10_000,
) {
  const client: PoolClient = await pool!.connect();
  await client.query("BEGIN");
  const { rows } = await client.query<{ pid: number }>(
    "SELECT pg_backend_pid() AS pid",
  );
  await client.query(statement, params);
  let ended: Promise<void> | null = null;
  const end = (command: "COMMIT" | "ROLLBACK") =>
    (ended ??= client
      .query(command)
      .then(() => undefined)
      .finally(() => client.release()));
  const timer = setTimeout(() => void end("ROLLBACK"), maxMs);
  return {
    pid: rows[0]!.pid,
    client,
    commit: () => {
      clearTimeout(timer);
      return end("COMMIT");
    },
    release: () => {
      clearTimeout(timer);
      return end("ROLLBACK");
    },
  };
}

/** Waits until `count` backends of this database wait on a lock. */
async function waitForWaiters(count: number) {
  for (let attempt = 0; ; attempt += 1) {
    const { rows } = await pool!.query<{ waiting: number }>(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE datname = current_database()
         AND cardinality(pg_blocking_pids(pid)) > 0`,
    );
    if (rows[0]!.waiting >= count) return;
    if (attempt > 250) throw new Error("Nothing ever waited.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

type BatchEmail = { to: string[] };

function accepted(emails: BatchEmail[]) {
  return {
    data: {
      data: emails.map(() => ({ id: `re_${randomUUID()}` })),
      errors: [],
    },
    error: null,
    headers: {},
  };
}

function pgError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

describeDatabase("retrying what failed", () => {
  let consoleError: MockInstance<typeof console.error>;
  let consoleWarn: MockInstance<typeof console.warn>;
  let consoleLog: MockInstance<typeof console.log>;

  function retryLogs() {
    return consoleLog.mock.calls.filter(
      ([first]) => first === "[comunicados] retry",
    );
  }

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    process.env.NEXT_PUBLIC_BASE_URL = BASE_URL;
    retryMod = await import("@/app/lib/comunicados/retry");
    retryActions = await import("@/app/lib/comunicados/retry-actions");
    retractMod = await import("@/app/lib/comunicados/retract");
    fanout = await import("@/app/lib/comunicados/fanout");
    driver = await import("@/app/lib/comunicados/driver");
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
        `SELECT resend_of_delivery_id, requested_by_user_id, maybe_sent_at
         FROM notification_deliveries LIMIT 1`,
      );
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  beforeEach(() => {
    sendBatchMock.mockReset();
    sendBatchMock.mockImplementation(async (emails: BatchEmail[]) =>
      accepted(emails),
    );
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // The app's `db` logs every statement; everything here goes through it.
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  async function cleanUp() {
    if (created.campaigns.length > 0) {
      // Deliveries go with their inbox item.
      await pool!.query(
        `DELETE FROM notifications WHERE campaign_id = ANY($1::int[])`,
        [created.campaigns],
      );
    }
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
      // Recipients cascade.
      await pool!.query(
        `DELETE FROM notification_campaigns WHERE id = ANY($1::int[])`,
        [created.campaigns],
      );
    }
    if (created.users.length > 0) {
      await pool!.query(
        `DELETE FROM notifications WHERE user_id = ANY($1::int[])`,
        [created.users],
      );
      await pool!.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [
        created.users,
      ]);
    }
    if (created.rateLimitKeys.length > 0) {
      await pool!.query(
        `DELETE FROM action_rate_limits WHERE key = ANY($1::text[])`,
        [created.rateLimitKeys],
      );
    }
    for (const ids of Object.values(created)) ids.length = 0;
  }

  afterEach(async () => {
    // Read before cleanup, assert after it, so a failure still cleans up.
    const errors = consoleError.mock.calls.map((args) => JSON.stringify(args));
    const lines = JSON.stringify([
      ...consoleWarn.mock.calls,
      ...consoleLog.mock.calls.filter((args) =>
        String(args[0]).startsWith("[comunicados]"),
      ),
    ]);
    // Every statement the app ran, with its params: an address in any of
    // them would be in the logs.
    const statements = JSON.stringify(consoleLog.mock.calls);
    vi.useRealTimers();
    vi.restoreAllMocks();
    state.viewer = null;
    state.flagOn = true;
    state.vercelEnv = "production";
    revalidatePath.mockClear();
    afterMock.mockClear();
    await cleanUp();
    expect(errors).toEqual([]);
    expect(lines).not.toContain("@");
    expect(statements).not.toContain("@");
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  describe("what it reopens", () => {
    it("reopens a completed campaign, and the campaign's own run sends and closes it again", async () => {
      const [delivered, failed] = await createPeople(2);
      const sent = await insertSent([delivered!, failed!]);
      await fanOut(sent);
      await settleEmail(sent, delivered!, "sent");
      await settleEmail(sent, failed!, "failed");
      await complete(sent);

      expect(await retry(sent)).toEqual({
        ok: true,
        campaignId: sent.campaignId,
        emails: 1,
        people: 0,
      });
      expect(await campaignOf(sent)).toEqual({
        status: "processing",
        completed_at: null,
      });
      expect(retryLogs()).toEqual([
        [
          "[comunicados] retry",
          {
            comunicadoId: sent.comunicadoId,
            campaignId: sent.campaignId,
            emails: 1,
            people: 0,
          },
        ],
      ]);

      const run = await drain(sent);
      expect(run.completed).toBe(1);
      expect(run.failedSteps).toEqual([]);
      expect(sendBatchMock).toHaveBeenCalledTimes(1);
      const { rows } = await pool!.query<{ email: string }>(
        `SELECT email FROM users WHERE id = $1`,
        [failed],
      );
      expect(
        sendBatchMock.mock.calls[0]![0].map((email: BatchEmail) => email.to),
      ).toEqual([[rows[0]!.email]]);
      const campaign = await campaignOf(sent);
      expect(campaign.status).toBe("completed");
      expect(campaign.completed_at).not.toBeNull();
      const emails = await emailsOf(sent);
      expect(retryRows(emails).map((row) => row.status)).toEqual(["sent"]);
    });

    it("puts the people the fan-out gave up on back to pending, and the run fans them out", async () => {
      const [reached, gaveUp] = await createPeople(2);
      const sent = await insertSent([reached!]);
      await fanOut(sent);
      await settleEmail(sent, reached!, "sent");
      await addFailedRecipient(sent, gaveUp!);
      await complete(sent);

      expect(await retry(sent)).toEqual({
        ok: true,
        campaignId: sent.campaignId,
        emails: 0,
        people: 1,
      });
      expect(await recipientOf(sent, gaveUp!)).toEqual({
        status: "pending",
        attempts: 0,
        last_error: null,
        processed: false,
        notification_id: null,
      });
      expect((await campaignOf(sent)).status).toBe("processing");

      const run = await drain(sent);
      expect(run).toMatchObject({ notified: 1, completed: 1, failedSteps: [] });
      expect(await recipientOf(sent, gaveUp!)).toMatchObject({
        status: "notified",
        attempts: 1,
        processed: true,
      });
      const emails = await emailsOf(sent);
      expect(
        emails.filter((row) => row.user_id === gaveUp).map((r) => r.status),
      ).toEqual(["sent"]);
      expect((await campaignOf(sent)).status).toBe("completed");
    });

    it("writes a row only for a latest email that failed before it could have landed, linked to it", async () => {
      const people = await createPeople(7);
      const [failed, maybeSent, sentAfterFailing, sentOk, skipped, queued] =
        people;
      const failedAgain = people[6]!;
      const sent = await insertSent(people);
      await fanOut(sent);
      await settleEmail(sent, failed!, "failed");
      await settleEmail(sent, maybeSent!, "failed_maybe_sent");
      await settleEmail(sent, sentAfterFailing!, "failed");
      await addLaterEmail(sent, sentAfterFailing!, "sent");
      await settleEmail(sent, sentOk!, "sent");
      await settleEmail(sent, skipped!, "skipped");
      await settleEmail(sent, queued!, "pending");
      // An earlier attempt may have landed, but the latest one failed
      // cleanly: the latest is what counts.
      await settleEmail(sent, failedAgain, "failed_maybe_sent");
      await addLaterEmail(sent, failedAgain, "failed");
      const before = await emailsOf(sent);
      const by = await createUser("admin");

      expect(await retry(sent, by)).toEqual({
        ok: true,
        campaignId: sent.campaignId,
        emails: 2,
        people: 0,
      });

      const after = await emailsOf(sent);
      const added = after.filter(
        (row) => !before.some((old) => old.id === row.id),
      );
      expect(added.map((row) => row.user_id).sort((x, y) => x - y)).toEqual(
        [failed!, failedAgain].sort((x, y) => x - y),
      );
      for (const row of added) {
        const latestBefore = before
          .filter((old) => old.user_id === row.user_id)
          .at(-1)!;
        expect(row).toMatchObject({
          status: "pending",
          lane: "bulk",
          template_key: "comunicado",
          payload: { comunicadoId: sent.comunicadoId },
          notification_id: latestBefore.notification_id,
          resend_of_delivery_id: latestBefore.id,
          requested_by_user_id: by,
          same_address: true,
          maybe_sent: false,
        });
        expect(row.idempotency_key).toMatch(RETRY_KEY);
        expect(RETRY_KEY.exec(row.idempotency_key)![1]).toBe(
          String(row.notification_id),
        );
      }
      // One key per call, shared by its rows.
      expect(
        new Set(added.map((row) => row.idempotency_key.split(":retry:")[1])),
      ).toHaveProperty("size", 1);
      // The rows it retried stay as they were.
      expect(
        after.filter((row) => before.some((old) => old.id === row.id)),
      ).toEqual(before);
    });

    it("never picks an email that may have reached Resend, and leaves the campaign closed when nothing else failed (V7)", async () => {
      const [maybeSent, delivered] = await createPeople(2);
      const sent = await insertSent([maybeSent!, delivered!]);
      await fanOut(sent);
      await settleEmail(sent, maybeSent!, "failed_maybe_sent");
      await settleEmail(sent, delivered!, "sent");
      await complete(sent);
      const campaign = await campaignOf(sent);
      const before = await emailsOf(sent);

      expect(await retry(sent)).toEqual({
        ok: false,
        code: "NOTHING",
        message: "No hay nada para reintentar.",
      });
      expect(await emailsOf(sent)).toEqual(before);
      expect(await campaignOf(sent)).toEqual(campaign);
      expect(retryLogs()).toEqual([]);
    });
  });

  describe("refusals", () => {
    it("refuses a missing comunicado, one that was not sent and one that was retracted", async () => {
      expect(await retryMod.retryFailedComunicado(MISSING_ID, 1)).toEqual({
        ok: false,
        code: "NOT_FOUND",
        message: "No encontramos este comunicado.",
      });

      const authorId = await createUser("admin");
      const { rows } = await pool!.query<{ id: number }>(
        `INSERT INTO comunicados (created_by_user_id, updated_by_user_id)
         VALUES ($1, $1) RETURNING id`,
        [authorId],
      );
      created.comunicados.push(rows[0]!.id);
      expect(
        await retryMod.retryFailedComunicado(rows[0]!.id, authorId),
      ).toEqual({
        ok: false,
        code: "NOT_SENT",
        message: "Este comunicado no se envió.",
      });

      const [person, gaveUp] = await createPeople(2);
      const sent = await insertSent([person!]);
      await fanOut(sent);
      await settleEmail(sent, person!, "failed");
      await addFailedRecipient(sent, gaveUp!);
      expect(
        await retractMod.retractComunicado(
          sent.comunicadoId,
          { reason: "Salió con el horario equivocado" },
          sent.authorId,
        ),
      ).toMatchObject({ ok: true });
      const before = await emailsOf(sent);

      expect(await retry(sent)).toEqual({
        ok: false,
        code: "RETRACTED",
        message: "Este comunicado fue retirado.",
      });
      expect(await emailsOf(sent)).toEqual(before);
      expect((await recipientOf(sent, gaveUp!)).status).toBe("failed");
    });

    it("refuses a comunicado another environment sent, writing nothing and running nothing (D9)", async () => {
      const [person, gaveUp] = await createPeople(2);
      // Sent, fanned out and settled in production.
      const sent = await insertSent([person!]);
      await fanOut(sent);
      await settleEmail(sent, person!, "failed");
      await addFailedRecipient(sent, gaveUp!);
      await complete(sent);
      const before = await emailsOf(sent);
      const campaign = await campaignOf(sent);
      const otherEnv = {
        ok: false,
        code: "OTHER_ENV",
        message:
          "Este comunicado se envió desde otro entorno: reintentalo desde allí.",
      };

      // A dev server would simulate its emails as sent and skip its list
      // people; a preview would skip them as staging.
      for (const env of ["development", "preview"]) {
        state.vercelEnv = env;
        expect(await retry(sent)).toEqual(otherEnv);
      }
      state.viewer = { id: await createUser("admin"), role: "admin" };
      created.rateLimitKeys.push(`comunicado-retry:${sent.comunicadoId}`);
      expect(
        await retryActions.retryFailedComunicadoAction(sent.comunicadoId),
      ).toEqual({ success: false, message: otherEnv.message });
      expect(afterMock).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(await emailsOf(sent)).toEqual(before);
      expect((await recipientOf(sent, gaveUp!)).status).toBe("failed");
      expect(await campaignOf(sent)).toEqual(campaign);
      expect(retryLogs()).toEqual([]);

      // From where it was sent, it retries.
      state.vercelEnv = "production";
      expect(await retry(sent)).toMatchObject({
        ok: true,
        emails: 1,
        people: 1,
      });
    });

    it("waits for a retraction in progress, then refuses", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent([person!]);
      await fanOut(sent);
      await settleEmail(sent, person!, "failed");
      const retraction = await holdTransaction(
        "SELECT pg_advisory_xact_lock($1, $2)",
        [COMUNICADO_LOCK_NS, sent.comunicadoId],
      );

      const retrying = retry(sent);
      await waitForWaiters(1);
      await retraction.client.query(
        `UPDATE comunicados
         SET retracted_at = now(), retracted_by_user_id = $2,
           retract_reason = 'Salió con el horario equivocado',
           version = version + 1
         WHERE id = $1`,
        [sent.comunicadoId, sent.authorId],
      );
      await retraction.commit();

      expect(await retrying).toMatchObject({ ok: false, code: "RETRACTED" });
      expect(retryRows(await emailsOf(sent))).toEqual([]);
    });

    it("holds a retraction back until it commits; the retraction then cancels what it reopened", async () => {
      const [person, gaveUp] = await createPeople(2);
      const sent = await insertSent([person!]);
      await fanOut(sent);
      await settleEmail(sent, person!, "failed");
      await addFailedRecipient(sent, gaveUp!);
      // The retry takes the shared lock, then waits here for the campaign.
      const completion = await holdTransaction(
        "SELECT id FROM notification_campaigns WHERE id = $1 FOR UPDATE",
        [sent.campaignId],
      );

      const retrying = retry(sent);
      await waitForWaiters(1);
      const retracting = retractMod.retractComunicado(
        sent.comunicadoId,
        { reason: "Salió con el horario equivocado" },
        sent.authorId,
      );
      await waitForWaiters(2);
      await completion.release();

      expect(await retrying).toMatchObject({ ok: true, emails: 1, people: 1 });
      expect(await retracting).toMatchObject({
        ok: true,
        skippedDeliveries: 1,
        skippedRecipients: 1,
      });
      const [retried] = retryRows(await emailsOf(sent));
      expect(retried).toMatchObject({ status: "skipped" });
      const { rows } = await pool!.query<{ last_error: string }>(
        `SELECT last_error FROM notification_deliveries WHERE id = $1`,
        [retried!.id],
      );
      expect(rows[0]!.last_error).toBe("retracted");
      expect((await recipientOf(sent, gaveUp!)).status).toBe("skipped");
    });

    it("retries a deadlock or a deletion committing under it once, and answers a lock timeout", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent([person!]);
      await fanOut(sent);
      await settleEmail(sent, person!, "failed");
      const transaction = vi.spyOn(appDb, "transaction");

      transaction.mockRejectedValueOnce(
        pgError("55P03", "canceling statement due to lock timeout"),
      );
      expect(await retry(sent)).toEqual({
        ok: false,
        code: "LOCKED",
        message:
          "No pudimos reintentarlo ahora. Probá de nuevo en unos segundos.",
      });
      expect(transaction).toHaveBeenCalledTimes(1);

      transaction.mockClear();
      transaction
        .mockRejectedValueOnce(pgError("40P01", "deadlock detected"))
        .mockRejectedValueOnce(pgError("40P01", "deadlock detected"));
      await expect(retry(sent)).rejects.toThrow("deadlock detected");
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(retryRows(await emailsOf(sent))).toEqual([]);

      transaction.mockClear();
      transaction.mockRejectedValueOnce(
        pgError("23503", "violates foreign key constraint"),
      );
      expect(await retry(sent)).toMatchObject({ ok: true, emails: 1 });
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(retryRows(await emailsOf(sent))).toHaveLength(1);
    });
  });

  describe("concurrency", () => {
    it("two retries at once write one row per person, and the second finds nothing", async () => {
      const people = await createPeople(3);
      const sent = await insertSent(people);
      await fanOut(sent);
      for (const person of people) await settleEmail(sent, person, "failed");
      // Both take the shared lock and queue on the campaign's row.
      const completion = await holdTransaction(
        "SELECT id FROM notification_campaigns WHERE id = $1 FOR UPDATE",
        [sent.campaignId],
      );

      const both = Promise.all([retry(sent), retry(sent)]);
      await waitForWaiters(2);
      await completion.release();

      const outcomes = await both;
      expect(outcomes).toContainEqual({
        ok: true,
        campaignId: sent.campaignId,
        emails: 3,
        people: 0,
      });
      expect(outcomes).toContainEqual({
        ok: false,
        code: "NOTHING",
        message: "No hay nada para reintentar.",
      });
      const rows = retryRows(await emailsOf(sent));
      expect(rows.map((row) => row.user_id).sort((x, y) => x - y)).toEqual(
        [...people].sort((x, y) => x - y),
      );
    });

    it("reopens a campaign that a completion closed while the retry waited for it", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent([person!]);
      await fanOut(sent);
      await settleEmail(sent, person!, "failed");
      // The completion's first statement: it locks the campaign, finds
      // nothing open, and closes it.
      const completion = await holdTransaction(
        "SELECT id FROM notification_campaigns WHERE id = $1 FOR UPDATE",
        [sent.campaignId],
      );

      const retrying = retry(sent);
      await waitForWaiters(1);
      await completion.client.query(
        `UPDATE notification_campaigns
         SET status = 'completed', completed_at = now(), updated_at = now()
         WHERE id = $1 AND status = 'processing'`,
        [sent.campaignId],
      );
      await completion.commit();

      expect(await retrying).toMatchObject({ ok: true, emails: 1 });
      expect(await campaignOf(sent)).toEqual({
        status: "processing",
        completed_at: null,
      });
    });

    it("a completion that waits for the retry sees its rows and leaves the campaign open", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent([person!]);
      await fanOut(sent);
      await settleEmail(sent, person!, "failed");
      const holder = await holdTransaction(
        "SELECT id FROM notification_campaigns WHERE id = $1 FOR UPDATE",
        [sent.campaignId],
      );

      const retrying = retry(sent);
      await waitForWaiters(1);
      const completing = fanout.completeComunicadoCampaign(sent.campaignId);
      await waitForWaiters(2);
      await holder.release();

      expect(await retrying).toMatchObject({ ok: true, emails: 1 });
      expect(await completing).toBe(false);
      expect((await campaignOf(sent)).status).toBe("processing");
    });
  });

  describe("the action", () => {
    it("retries for a global admin once per 5 minutes, and drains the campaign after the answer", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent([person!]);
      await fanOut(sent);
      await settleEmail(sent, person!, "failed");
      await complete(sent);
      state.viewer = { id: await createUser("admin"), role: "admin" };
      created.rateLimitKeys.push(`comunicado-retry:${sent.comunicadoId}`);
      // The limit counts in fixed 5-minute windows: start mid-window, so both
      // clicks fall in the same one.
      const windowMs = 5 * 60_000;
      vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
      vi.setSystemTime(
        Math.floor(Date.now() / windowMs) * windowMs + windowMs / 2,
      );

      expect(
        await retryActions.retryFailedComunicadoAction(sent.comunicadoId),
      ).toEqual({ success: true, message: "Los estamos reintentando." });
      expect(retryRows(await emailsOf(sent))).toMatchObject([
        { requested_by_user_id: state.viewer.id, status: "pending" },
      ]);
      expect(revalidatePath.mock.calls).toEqual([
        ["/dashboard/communications"],
        [`/dashboard/communications/${sent.comunicadoId}`],
      ]);

      expect(afterMock).toHaveBeenCalledTimes(1);
      await afterMock.mock.calls[0]![0]();
      expect(sendBatchMock).toHaveBeenCalledTimes(1);
      expect((await campaignOf(sent)).status).toBe("completed");
      expect(retryRows(await emailsOf(sent))).toMatchObject([
        { status: "sent" },
      ]);

      await settleEmail(sent, person!, "failed");
      expect(
        await retryActions.retryFailedComunicadoAction(sent.comunicadoId),
      ).toEqual({
        success: false,
        message: "Ya se reintentó hace poco. Probá de nuevo en unos minutos.",
      });
      expect(retryRows(await emailsOf(sent))).toHaveLength(1);
    });

    it("gives the slot back when nothing was retried, so trying again soon, as it says, goes through", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent([person!]);
      await fanOut(sent);
      await settleEmail(sent, person!, "failed");
      await complete(sent);
      state.viewer = { id: await createUser("admin"), role: "admin" };
      created.rateLimitKeys.push(`comunicado-retry:${sent.comunicadoId}`);
      const windowMs = 5 * 60_000;
      vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
      vi.setSystemTime(
        Math.floor(Date.now() / windowMs) * windowMs + windowMs / 2,
      );
      const click = () =>
        retryActions.retryFailedComunicadoAction(sent.comunicadoId);
      const transaction = vi.spyOn(appDb, "transaction");

      // A lock held past the timeout, and another admin's click refused
      // while the first one waited for it.
      let meanwhile: unknown;
      transaction.mockImplementationOnce(async () => {
        meanwhile = await click();
        throw pgError("55P03", "canceling statement due to lock timeout");
      });
      expect(await click()).toEqual({
        success: false,
        message:
          "No pudimos reintentarlo ahora. Probá de nuevo en unos segundos.",
      });
      expect(meanwhile).toEqual({
        success: false,
        message: "Ya se reintentó hace poco. Probá de nuevo en unos minutos.",
      });

      // A failure that rolled back.
      transaction
        .mockRejectedValueOnce(pgError("40P01", "deadlock detected"))
        .mockRejectedValueOnce(pgError("40P01", "deadlock detected"));
      expect(await click()).toEqual({
        success: false,
        message: "No pudimos reintentarlo. Probá de nuevo.",
      });
      expect(consoleError.mock.calls).toEqual([
        ["[comunicados] retry failed", { errorType: "Error" }],
      ]);
      consoleError.mockClear();
      expect(retryRows(await emailsOf(sent))).toEqual([]);

      // Seconds later, in the same window: it retries, and only once.
      expect(await click()).toEqual({
        success: true,
        message: "Los estamos reintentando.",
      });
      expect(retryRows(await emailsOf(sent))).toHaveLength(1);
      expect(await click()).toEqual({
        success: false,
        message: "Ya se reintentó hace poco. Probá de nuevo en unos minutos.",
      });
      expect(afterMock).toHaveBeenCalledTimes(1);
    });

    it("refuses a festival admin, and anyone while the flag is off", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent([person!]);
      await fanOut(sent);
      await settleEmail(sent, person!, "failed");

      state.viewer = {
        id: await createUser("festival_admin"),
        role: "festival_admin",
      };
      expect(
        await retryActions.retryFailedComunicadoAction(sent.comunicadoId),
      ).toEqual({ success: false, message: "No autorizado." });
      state.viewer = { id: await createUser("admin"), role: "admin" };
      state.flagOn = false;
      expect(
        await retryActions.retryFailedComunicadoAction(sent.comunicadoId),
      ).toEqual({
        success: false,
        message: "Esta funcionalidad no está disponible",
      });

      expect(retryRows(await emailsOf(sent))).toEqual([]);
      expect(afterMock).not.toHaveBeenCalled();
    });
  });
});
