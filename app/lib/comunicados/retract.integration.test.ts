// @vitest-environment node

import { randomUUID } from "crypto";
import { inArray, sql } from "drizzle-orm";
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
import type {
  BulkEmailRenderer,
  BulkTiming,
} from "@/app/lib/notifications/bulk-email";
import * as schema from "@/db/schema";
import {
  comunicadoRevisions,
  comunicados,
  notificationCampaigns,
  notifications,
  users,
} from "@/db/schema";

/**
 * Retracting a sent comunicado against a real database
 * (docs/IMPLEMENTATION-comunicados.md F3, F4, F5 V3, V4, V10, G7): it waits
 * for the chunk or batch holding the content lock, leaves every inbox read
 * and write, cancels what is still pending, stops later chunks and batches,
 * and closes the campaign now or once a claim settles. The fan-out, the bulk
 * lane, the comunicado renderer and the driver are real; Resend is mocked,
 * and there are no VAPID keys, so nothing leaves the test. Every assertion is
 * about this file's own rows.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
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
  /** Runs inside a fan-out chunk's transaction, once its rows are written. */
  afterNotifyMany: null as null | (() => Promise<void>),
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
// The inbox resolves its viewer from Clerk and its flag; tests set it.
vi.mock("@/app/lib/notifications/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/notifications/queries")>()),
  resolveInboxViewer: async () => state.viewer,
  resolveInboxViewerWithAccess: async () => state.viewer,
}));
// The real `notifyMany`, with a hook to hold a chunk before it commits.
vi.mock("@/app/lib/notifications/notify", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/lib/notifications/notify")>();
  return {
    ...actual,
    notifyMany: async (...args: Parameters<typeof actual.notifyMany>) => {
      const result = await actual.notifyMany(...args);
      await state.afterNotifyMany?.();
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

type Retract = typeof import("@/app/lib/comunicados/retract");
type RetractActions = typeof import("@/app/lib/comunicados/retract-actions");
type Fanout = typeof import("@/app/lib/comunicados/fanout");
type Driver = typeof import("@/app/lib/comunicados/driver");
type Delivery = typeof import("@/app/lib/comunicados/delivery");
type BulkEmail = typeof import("@/app/lib/notifications/bulk-email");
type Inbox = typeof import("@/app/lib/notifications/queries");
type InboxActions = typeof import("@/app/lib/notifications/actions");
type OpenRoute =
  typeof import("@/app/(routes)/my_notifications/[notificationId]/open/route");
type AppDb = (typeof import("@/db"))["db"];
let retractMod: Retract;
let retractActions: RetractActions;
let fanout: Fanout;
let driver: Driver;
let delivery: Delivery;
let bulk: BulkEmail;
let inbox: Inbox;
let inboxActions: InboxActions;
let openRoute: OpenRoute;
let appDb: AppDb;

const BASE_URL = "https://glitter.test";
const COMUNICADO_LOCK_NS = 8155;
const RETRACTED = "Retirado antes de enviarse";
const REASON = "Salió con el horario equivocado";
const MISSING_ID = 2_147_483_000;
const LATER = () => Date.now() + 60_000;
/** Older than anything else the shared database holds, so lane-wide reads take these first. */
const LONG_AGO = "2001-01-01T00:00:00Z";

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
};

async function createUser(role: Role = "user") {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `retract-${suffix}`,
      email: `retract-${suffix}@example.test`,
      displayName: `Retiro ${suffix.slice(0, 8)}`,
      role,
      status: "verified",
    })
    .returning({ id: users.id });
  created.users.push(user!.id);
  return user!.id;
}

/** Verified participants, in one statement. */
async function createPeople(count: number) {
  const { rows } = await pool!.query<{ id: number }>(
    `INSERT INTO users (clerk_id, email, display_name, role, status)
     SELECT 'retract-' || $1 || '-' || g,
            'retract-' || $1 || '-' || g || '@example.test',
            'Retiro ' || g, 'user', 'verified'
     FROM generate_series(1, $2::int) AS g
     RETURNING id`,
    [randomUUID(), count],
  );
  const ids = rows.map((row) => row.id);
  created.users.push(...ids);
  return ids;
}

async function addDevice(userId: number) {
  await pool!.query(
    `INSERT INTO push_subscriptions
       (user_id, endpoint, p256dh, auth, application_server_key)
     VALUES ($1, $2, 'p256dh', 'auth', 'retract-test-key')`,
    [userId, `https://push.example.test/${randomUUID()}`],
  );
}

function summaryFor(
  env: ComunicadoAudienceSummary["env"],
  { sendEmail, sendPush }: { sendEmail: boolean; sendPush: boolean },
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
    channels: { email: sendEmail, push: sendPush },
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

const TEXT = "El armado empieza a las 8:00.";

type Sent = {
  campaignId: number;
  comunicadoId: number;
  authorId: number;
  /** Recipient row id by user id. */
  recipients: Map<number, number>;
};

/**
 * A comunicado as the send leaves it: a processing campaign, the sent row
 * with its frozen summary, revision 1, and one pending recipient per person,
 * entered from a list.
 */
async function insertSent({
  people,
  sendEmail = true,
  sendPush = false,
  createdAt = null,
}: {
  people: number[];
  sendEmail?: boolean;
  sendPush?: boolean;
  createdAt?: string | null;
}): Promise<Sent> {
  const authorId = await createUser("admin");
  const title = "Cambio de horario de armado";
  const campaign = await pool!.query<{ id: number }>(
    `INSERT INTO notification_campaigns
       (type, status, title, message, created_by_user_id, idempotency_key, created_at)
     VALUES ('comunicado', 'processing', $1, $2, $3, $4, coalesce($5::timestamp, now()))
     RETURNING id`,
    [title, TEXT, authorId, `comunicado:test-${randomUUID()}`, createdAt],
  );
  const campaignId = campaign.rows[0]!.id;
  created.campaigns.push(campaignId);
  const comunicado = await pool!.query<{ id: number }>(
    `INSERT INTO comunicados
       (status, title, campaign_id, current_revision, sent_at, sent_by_user_id,
        audience_summary, send_email, send_push, created_by_user_id,
        updated_by_user_id)
     VALUES ('sent', $1, $2, 1, now(), $3, $4::jsonb, $5, $6, $3, $3)
     RETURNING id`,
    [
      title,
      campaignId,
      authorId,
      JSON.stringify(summaryFor("production", { sendEmail, sendPush })),
      sendEmail,
      sendPush,
    ],
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
  const recipients = await addRecipients(campaignId, people);
  return { campaignId, comunicadoId, authorId, recipients };
}

async function addRecipients(campaignId: number, people: number[]) {
  const { rows } = await pool!.query<{ id: number; user_id: number }>(
    `INSERT INTO notification_campaign_recipients
       (campaign_id, user_id, status, source)
     SELECT $1, t.user_id, 'pending', 'list'
     FROM unnest($2::int[]) AS t(user_id)
     RETURNING id, user_id`,
    [campaignId, people],
  );
  return new Map(rows.map((row) => [row.user_id, row.id]));
}

/** Everyone pending becomes an inbox item, with its email and push rows. */
async function fanOut(sent: Sent) {
  const run = await fanout.fanOutComunicado({
    campaignId: sent.campaignId,
    comunicadoId: sent.comunicadoId,
    deadline: LATER(),
  });
  expect(run.stopped).toBe("done");
  return run;
}

function retract(sent: Sent, reason = REASON) {
  return retractMod.retractComunicado(
    sent.comunicadoId,
    { reason },
    sent.authorId,
  );
}

type DeliveryRow = {
  id: number;
  user_id: number;
  channel: "email" | "push";
  status: string;
  last_error: string | null;
  maybe_sent: boolean;
  batch_key: string | null;
  lease_owner: string | null;
  content_revision: number | null;
  provider_message_id: string | null;
};

async function deliveriesOf(campaignId: number) {
  const { rows } = await pool!.query<DeliveryRow>(
    `SELECT d.id, d.user_id, d.channel, d.status, d.last_error,
            d.maybe_sent_at IS NOT NULL AS maybe_sent, d.batch_key,
            d.lease_owner, d.content_revision, d.provider_message_id
     FROM notification_deliveries d
     JOIN notifications n ON n.id = d.notification_id
     WHERE n.campaign_id = $1
     ORDER BY d.id`,
    [campaignId],
  );
  return rows;
}

type RecipientRow = {
  id: number;
  status: string;
  skipped_reason: string | null;
  processed: boolean;
  notification_id: number | null;
};

async function recipientsOf(campaignId: number) {
  const { rows } = await pool!.query<RecipientRow & { user_id: number }>(
    `SELECT id, user_id, status, skipped_reason,
            processed_at IS NOT NULL AS processed, notification_id
     FROM notification_campaign_recipients WHERE campaign_id = $1`,
    [campaignId],
  );
  return new Map(
    rows.map(({ user_id, ...row }) => [user_id, row as RecipientRow]),
  );
}

type ItemRow = {
  id: number;
  user_id: number;
  read_at: Date | null;
  archived_at: Date | null;
  retracted_at: Date | null;
};

async function itemsOf(campaignId: number) {
  const { rows } = await pool!.query<ItemRow>(
    `SELECT id, user_id, read_at, archived_at, retracted_at
     FROM notifications WHERE campaign_id = $1 ORDER BY id`,
    [campaignId],
  );
  return rows;
}

async function itemOf(campaignId: number, userId: number) {
  const item = (await itemsOf(campaignId)).find(
    (row) => row.user_id === userId,
  );
  if (!item) throw new Error("no item for that person");
  return item;
}

async function comunicadoOf(id: number) {
  const { rows } = await pool!.query<{
    status: string;
    version: number;
    retracted_at: Date | null;
    retracted_by_user_id: number | null;
    retract_reason: string | null;
    updated_by_user_id: number | null;
    current_revision: number | null;
    campaign_id: number | null;
  }>(
    `SELECT status, version, retracted_at, retracted_by_user_id,
            retract_reason, updated_by_user_id, current_revision, campaign_id
     FROM comunicados WHERE id = $1`,
    [id],
  );
  return rows[0]!;
}

async function campaignStatus(campaignId: number) {
  const { rows } = await pool!.query<{ status: string; completed: boolean }>(
    `SELECT status, completed_at IS NOT NULL AS completed
     FROM notification_campaigns WHERE id = $1`,
    [campaignId],
  );
  return rows[0]!;
}

/**
 * A second connection holding a transaction open, for lock tests. Let go by
 * the returned function, or after `maxMs` so a failing test cannot hang.
 */
async function holdTransaction(
  statement: string,
  params: unknown[] = [],
  maxMs = 10_000,
) {
  const client: PoolClient = await pool!.connect();
  await client.query("BEGIN");
  await client.query(statement, params);
  let released: Promise<void> | null = null;
  const release = () =>
    (released ??= client
      .query("ROLLBACK")
      .then(() => undefined)
      .finally(() => client.release()));
  const timer = setTimeout(() => void release(), maxMs);
  return () => {
    clearTimeout(timer);
    return release();
  };
}

/** Waits until a retraction is queued for this comunicado's content lock. */
async function waitForRetractionToWait(comunicadoId: number) {
  for (let attempt = 0; ; attempt += 1) {
    const { rows } = await pool!.query<{ waiting: number }>(
      `SELECT count(*)::int AS waiting FROM pg_locks
       WHERE locktype = 'advisory' AND classid = $1 AND objid = $2
         AND objsubid = 2 AND mode = 'ExclusiveLock' AND NOT granted`,
      [COMUNICADO_LOCK_NS, comunicadoId],
    );
    if (rows[0]!.waiting > 0) return;
    if (attempt > 250) throw new Error("The retraction never waited.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
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

function runLane(campaignId: number, deadline = LATER()) {
  return bulk.sendBulkEmails({ campaignId, deadline, timing: FAST });
}

function deadlock() {
  return Object.assign(new Error("deadlock detected"), { code: "40P01" });
}

describeDatabase("retracting a sent comunicado", () => {
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

  function retractLogs() {
    return consoleLog.mock.calls.filter(
      ([first]) => first === "[comunicados] retract",
    );
  }

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    process.env.NEXT_PUBLIC_BASE_URL = BASE_URL;
    retractMod = await import("@/app/lib/comunicados/retract");
    retractActions = await import("@/app/lib/comunicados/retract-actions");
    fanout = await import("@/app/lib/comunicados/fanout");
    driver = await import("@/app/lib/comunicados/driver");
    delivery = await import("@/app/lib/comunicados/delivery");
    bulk = await import("@/app/lib/notifications/bulk-email");
    inbox = await import("@/app/lib/notifications/queries");
    inboxActions = await import("@/app/lib/notifications/actions");
    openRoute =
      await import("@/app/(routes)/my_notifications/[notificationId]/open/route");
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
    const db = integrationDb!;
    if (created.campaigns.length > 0) {
      // Deliveries go with their inbox item.
      await db
        .delete(notifications)
        .where(inArray(notifications.campaignId, created.campaigns));
    }
    if (created.users.length > 0) {
      await db
        .delete(notifications)
        .where(inArray(notifications.userId, created.users));
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
      // Recipients cascade.
      await db
        .delete(notificationCampaigns)
        .where(inArray(notificationCampaigns.id, created.campaigns));
    }
    if (created.users.length > 0) {
      // Devices cascade.
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
    vi.restoreAllMocks();
    state.viewer = null;
    state.flagOn = true;
    state.vercelEnv = "production";
    state.afterNotifyMany = null;
    revalidatePath.mockClear();
    await cleanUp();
    expect(errors).toEqual([]);
    expect(lines).not.toContain("@");
    expect(statements).not.toContain("@");
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  describe("work in flight", () => {
    it("waits for a batch holding the comunicado's shared lock, then retracts", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);
      const release = await holdTransaction(
        "SELECT pg_advisory_xact_lock_shared(8155, $1)",
        [sent.comunicadoId],
      );

      const retracting = retract(sent);
      await waitForRetractionToWait(sent.comunicadoId);
      expect((await comunicadoOf(sent.comunicadoId)).retracted_at).toBeNull();
      expect((await itemOf(sent.campaignId, person!)).retracted_at).toBeNull();

      await release();
      expect(await retracting).toEqual({
        ok: true,
        campaignId: sent.campaignId,
        completed: true,
        hidden: 1,
        skippedDeliveries: 1,
        skippedRecipients: 0,
      });
      expect(
        (await comunicadoOf(sent.comunicadoId)).retracted_at,
      ).not.toBeNull();
    });

    it("waits for the lane's batch while Resend has it; the rows after it are never requested", async () => {
      // One batch holds 100: the 101st is the next batch's.
      const people = await createPeople(101);
      const sent = await insertSent({ people });
      await fanOut(sent);
      const inFlight = gate();
      const answer = gate();
      sendBatchMock.mockImplementationOnce(async (emails: BatchEmail[]) => {
        inFlight.open();
        await answer.opened;
        return accepted(emails);
      });

      const lane = runLane(sent.campaignId);
      await inFlight.opened;
      const retracting = retract(sent);
      await waitForRetractionToWait(sent.comunicadoId);
      expect((await comunicadoOf(sent.comunicadoId)).retracted_at).toBeNull();

      answer.open();
      const outcome = await retracting;
      expect(outcome).toMatchObject({ ok: true, hidden: 101 });
      await lane;
      // Whatever that run handed back is the next run's to skip.
      await runLane(sent.campaignId);

      expect(sendBatchMock).toHaveBeenCalledTimes(1);
      expect(sendBatchMock.mock.calls[0]![0]).toHaveLength(100);
      const emails = await deliveriesOf(sent.campaignId);
      expect(emails.filter((d) => d.status === "sent")).toHaveLength(100);
      expect(
        emails
          .filter((d) => d.status !== "sent")
          .map((d) => [d.status, d.last_error]),
      ).toEqual([["skipped", "retracted"]]);
      // The 101st was either still pending, and the retraction closed the
      // campaign, or already claimed, and the next tick closes it.
      if (outcome.ok && !outcome.completed) {
        expect(await fanout.completeComunicadoCampaign(sent.campaignId)).toBe(
          true,
        );
      }
      expect(await campaignStatus(sent.campaignId)).toEqual({
        status: "completed",
        completed: true,
      });
    }, 60_000);

    it("waits for a fan-out chunk to commit, then takes out what it wrote", async () => {
      const people = await createPeople(3);
      const sent = await insertSent({ people, sendPush: true });
      for (const person of people) await addDevice(person);
      const written = gate();
      const commit = gate();
      state.afterNotifyMany = async () => {
        written.open();
        await commit.opened;
      };

      const fanning = fanout.fanOutComunicado({
        campaignId: sent.campaignId,
        comunicadoId: sent.comunicadoId,
        deadline: LATER(),
      });
      await written.opened;
      const retracting = retract(sent);
      await waitForRetractionToWait(sent.comunicadoId);

      commit.open();
      expect(await fanning).toMatchObject({ notified: 3, stopped: "done" });
      expect(await retracting).toEqual({
        ok: true,
        campaignId: sent.campaignId,
        completed: true,
        hidden: 3,
        // An email and a push for each.
        skippedDeliveries: 6,
        skippedRecipients: 0,
      });

      const recipients = await recipientsOf(sent.campaignId);
      expect([...recipients.values()].map((r) => r.status)).toEqual([
        "notified",
        "notified",
        "notified",
      ]);
      const items = await itemsOf(sent.campaignId);
      expect(items).toHaveLength(3);
      for (const item of items) {
        expect(item.retracted_at).not.toBeNull();
        expect(item.archived_at).not.toBeNull();
      }
      expect(
        (await deliveriesOf(sent.campaignId)).map((d) => [
          d.channel,
          d.status,
          d.last_error,
        ]),
      ).toEqual(
        expect.arrayContaining([
          ["email", "skipped", "retracted"],
          ["push", "skipped", "retracted"],
        ]),
      );
      expect(
        (await deliveriesOf(sent.campaignId)).every(
          (d) => d.status === "skipped" && d.last_error === "retracted",
        ),
      ).toBe(true);
    });
  });

  describe("afterwards", () => {
    it("is gone from the list, the badge, mark-all, the detail page and /open, and stays as it was (V3)", async () => {
      const [reader, other] = await createPeople(2);
      const sent = await insertSent({ people: [reader!, other!] });
      await fanOut(sent);
      const readItem = await itemOf(sent.campaignId, reader!);
      const unreadItem = await itemOf(sent.campaignId, other!);
      await pool!.query(
        "UPDATE notifications SET read_at = now() - interval '1 hour' WHERE id = $1",
        [readItem.id],
      );
      // Something else in the same inbox, which stays.
      const { rows } = await pool!.query<{ id: number }>(
        `INSERT INTO notifications (user_id, kind, category, title, body, dedupe_key)
         VALUES ($1, 'comunicado', 'announcements', 'Otro anuncio', 'Sigue acá.', $2)
         RETURNING id`,
        [other, `comunicado:${randomUUID()}`],
      );
      const kept = rows[0]!.id;
      const viewer = { id: other!, role: "user" as const };
      const before = await inbox.fetchInboxPage(viewer);
      expect(before.items.map((item) => item.id)).toEqual([
        kept,
        unreadItem.id,
      ]);
      expect(before.unreadCount).toBe(2);

      expect(await retract(sent)).toMatchObject({ ok: true, hidden: 2 });

      const page = await inbox.fetchInboxPage(viewer);
      expect(page.items.map((item) => item.id)).toEqual([kept]);
      expect(page.unreadCount).toBe(1);
      const chip = await inbox.fetchInboxPage(viewer, {
        filter: "announcements",
      });
      expect(chip.items.map((item) => item.id)).toEqual([kept]);
      expect(await inbox.fetchUnreadNotificationCount(viewer)).toBe(1);
      expect(
        await inbox.fetchNotificationForViewer(viewer, unreadItem.id),
      ).toBeNull();

      // A push tap or a bookmark lands on the inbox, and reads nothing.
      state.viewer = viewer;
      const response = await openRoute.GET(
        new Request(`${BASE_URL}/my_notifications/${unreadItem.id}/open`, {
          headers: { "sec-fetch-site": "none" },
        }),
        { params: Promise.resolve({ notificationId: String(unreadItem.id) }) },
      );
      expect(response.status).toBe(303);
      expect(new URL(response.headers.get("location")!).pathname).toBe(
        "/my_notifications",
      );

      // Late writes from a stale client update nothing.
      const stateBefore = await itemsOf(sent.campaignId);
      await inboxActions.markNotificationReadAction(unreadItem.id);
      await inboxActions.unarchiveNotificationAction(unreadItem.id);
      await inboxActions.archiveNotificationAction(unreadItem.id);
      const markAll = await inboxActions.markAllNotificationsReadAction("all");
      expect(markAll).toEqual({ success: true, ids: [kept] });
      state.viewer = { id: reader!, role: "user" };
      await inboxActions.markNotificationUnreadAction(readItem.id);
      await inboxActions.markNotificationsUnreadAction([readItem.id]);
      await inboxActions.unarchiveNotificationAction(readItem.id);

      const after = await itemsOf(sent.campaignId);
      expect(after).toEqual(stateBefore);
      expect(after.find((item) => item.id === readItem.id)!.read_at).not.toBe(
        null,
      );
      expect(
        after.find((item) => item.id === unreadItem.id)!.read_at,
      ).toBeNull();
    });

    it("cancels pending email and push, maybe-sent ones included, and skips who was still pending (V4)", async () => {
      const people = await createPeople(3);
      const sent = await insertSent({ people, sendPush: true });
      for (const person of people) await addDevice(person);
      await fanOut(sent);
      const emails = (await deliveriesOf(sent.campaignId)).filter(
        (d) => d.channel === "email",
      );
      expect(emails).toHaveLength(3);
      // An earlier attempt may have reached Resend: kept as such.
      const batchKey = `comunicado-batch:${sent.campaignId}:${randomUUID()}`;
      await pool!.query(
        `UPDATE notification_deliveries
         SET maybe_sent_at = now(), batch_key = $2, attempts = 1
         WHERE id = $1`,
        [emails[0]!.id, batchKey],
      );
      // Someone the fan-out has not reached yet.
      const [late] = await createPeople(1);
      const lateRows = await addRecipients(sent.campaignId, [late!]);
      const lateRecipient = lateRows.get(late!)!;

      expect(await retract(sent)).toEqual({
        ok: true,
        campaignId: sent.campaignId,
        completed: true,
        hidden: 3,
        skippedDeliveries: 6,
        skippedRecipients: 1,
      });

      const after = await deliveriesOf(sent.campaignId);
      expect(after).toHaveLength(6);
      for (const row of after) {
        expect(row).toMatchObject({
          status: "skipped",
          last_error: "retracted",
        });
      }
      expect(after.find((d) => d.id === emails[0]!.id)).toMatchObject({
        maybe_sent: true,
        batch_key: batchKey,
      });
      const recipients = await recipientsOf(sent.campaignId);
      expect(recipients.get(late!)).toMatchObject({
        status: "skipped",
        skipped_reason: RETRACTED,
        processed: true,
        notification_id: null,
      });
      for (const person of people) {
        expect(recipients.get(person)!.status).toBe("notified");
      }

      // A chunk that read its candidates before the retraction stops at the
      // lock, writing nothing.
      expect(
        await fanout.processComunicadoChunk(
          sent.campaignId,
          sent.comunicadoId,
          new Set(),
          { candidateIds: [lateRecipient] },
        ),
      ).toEqual({ kind: "retracted" });
      expect(await itemsOf(sent.campaignId)).toHaveLength(3);
      expect(await campaignStatus(sent.campaignId)).toEqual({
        status: "completed",
        completed: true,
      });
      expect(retractLogs()).toEqual([
        [
          "[comunicados] retract",
          {
            comunicadoId: sent.comunicadoId,
            campaignId: sent.campaignId,
            hidden: 3,
            skippedDeliveries: 6,
            skippedRecipients: 1,
            completed: true,
          },
        ],
      ]);
    });

    it("leaves a claimed batch to meet the retraction in its pre-check, and the sweep closes the campaign (V10)", async () => {
      const people = await createPeople(2);
      // The sweep takes the oldest campaigns first, whatever else is open.
      const sent = await insertSent({ people, createdAt: LONG_AGO });
      await fanOut(sent);
      const claimed = gate();
      const proceed = gate();
      const real = delivery.comunicadoBatchRenderer;
      const held: BulkEmailRenderer = {
        ...real,
        lockContent: async (tx, campaignId) => {
          claimed.open();
          await proceed.opened;
          return real.lockContent(tx, campaignId);
        },
      };

      const lane = bulk.sendBulkEmails({
        campaignId: sent.campaignId,
        deadline: LATER(),
        timing: FAST,
        renderers: { comunicado: held },
      });
      await claimed.opened;
      expect(
        (await deliveriesOf(sent.campaignId)).map((d) => d.status),
      ).toEqual(["processing", "processing"]);

      // The claim holds no content lock yet: the retraction does not wait,
      // and leaves the claimed rows to the batch.
      expect(await retract(sent)).toMatchObject({
        ok: true,
        completed: false,
        skippedDeliveries: 0,
      });
      expect(await campaignStatus(sent.campaignId)).toEqual({
        status: "processing",
        completed: false,
      });

      proceed.open();
      expect(await lane).toMatchObject({ requests: 0, skipped: 2 });
      expect(sendBatchMock).not.toHaveBeenCalled();
      for (const row of await deliveriesOf(sent.campaignId)) {
        expect(row).toMatchObject({
          status: "skipped",
          last_error: "retracted",
          lease_owner: null,
        });
      }

      await fanout.sweepComunicadoCompletions({ limit: 50 });
      expect(await campaignStatus(sent.campaignId)).toEqual({
        status: "completed",
        completed: true,
      });
    });

    it("skips a crashed claim handed back for lack of time, as possibly sent, and the next tick closes the campaign (V10)", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);
      const [email] = await deliveriesOf(sent.campaignId);
      // A batch that claimed it and never settled: its lease has run out.
      await pool!.query(
        `UPDATE notification_deliveries
         SET status = 'processing', lease_owner = 'bulk-email:crashed',
           lease_expires_at = now() - interval '1 minute', attempts = 1,
           batch_key = $2
         WHERE id = $1`,
        [email!.id, `comunicado-batch:${sent.campaignId}:${randomUUID()}`],
      );

      expect(await retract(sent)).toMatchObject({
        ok: true,
        completed: false,
        skippedDeliveries: 0,
      });

      // Re-claimed whole, then handed back: no time is left for a request.
      expect(await runLane(sent.campaignId, Date.now())).toMatchObject({
        batches: 1,
        requests: 0,
        released: 0,
        skipped: 1,
        stopped: "reserve",
      });
      expect(sendBatchMock).not.toHaveBeenCalled();
      expect((await deliveriesOf(sent.campaignId))[0]).toMatchObject({
        status: "skipped",
        last_error: "retracted",
        maybe_sent: true,
        lease_owner: null,
      });

      const tick = await driver.runComunicadoWork({
        scope: { campaignId: sent.campaignId },
        deadline: LATER(),
        trigger: "send",
        emailTiming: FAST,
      });
      expect(tick.failedSteps).toEqual([]);
      expect(sendBatchMock).not.toHaveBeenCalled();
      expect(await campaignStatus(sent.campaignId)).toEqual({
        status: "completed",
        completed: true,
      });
    });

    it("keeps the report: read times, what each email did, and the revisions", async () => {
      const people = await createPeople(3);
      const sent = await insertSent({ people });
      await fanOut(sent);
      const [sentEmail, failedEmail, pendingEmail] = await deliveriesOf(
        sent.campaignId,
      );
      await pool!.query(
        `UPDATE notification_deliveries
         SET status = 'sent', sent_at = now(), provider_message_id = 're_kept',
           content_revision = 1, attempts = 1, batch_key = $2
         WHERE id = $1`,
        [sentEmail!.id, `comunicado-batch:${sent.campaignId}:${randomUUID()}`],
      );
      await pool!.query(
        `UPDATE notification_deliveries
         SET status = 'failed', last_error = 'expired' WHERE id = $1`,
        [failedEmail!.id],
      );
      const reader = await itemOf(sent.campaignId, sentEmail!.user_id);
      await pool!.query(
        "UPDATE notifications SET read_at = now() - interval '1 hour' WHERE id = $1",
        [reader.id],
      );
      const readBefore = (await itemOf(sent.campaignId, sentEmail!.user_id))
        .read_at;
      const recipientsBefore = await recipientsOf(sent.campaignId);
      const before = await comunicadoOf(sent.comunicadoId);
      const revisionsBefore = await pool!.query(
        "SELECT * FROM comunicado_revisions WHERE comunicado_id = $1",
        [sent.comunicadoId],
      );

      expect(await retract(sent)).toMatchObject({
        ok: true,
        completed: true,
        skippedDeliveries: 1,
      });

      const after = await deliveriesOf(sent.campaignId);
      expect(after.find((d) => d.id === sentEmail!.id)).toMatchObject({
        status: "sent",
        provider_message_id: "re_kept",
        content_revision: 1,
        last_error: null,
      });
      expect(after.find((d) => d.id === failedEmail!.id)).toMatchObject({
        status: "failed",
        last_error: "expired",
      });
      expect(after.find((d) => d.id === pendingEmail!.id)).toMatchObject({
        status: "skipped",
        last_error: "retracted",
      });
      expect(
        (await itemOf(sent.campaignId, sentEmail!.user_id)).read_at,
      ).toEqual(readBefore);
      expect(await recipientsOf(sent.campaignId)).toEqual(recipientsBefore);
      expect(
        (
          await pool!.query(
            "SELECT * FROM comunicado_revisions WHERE comunicado_id = $1",
            [sent.comunicadoId],
          )
        ).rows,
      ).toEqual(revisionsBefore.rows);
      expect(await comunicadoOf(sent.comunicadoId)).toMatchObject({
        status: "sent",
        version: before.version + 1,
        retracted_by_user_id: sent.authorId,
        retract_reason: REASON,
        updated_by_user_id: sent.authorId,
        current_revision: 1,
        campaign_id: sent.campaignId,
      });
    });
  });

  describe("refusals", () => {
    it("retracts once: a second retraction changes nothing", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);
      expect((await retract(sent)).ok).toBe(true);
      const first = await comunicadoOf(sent.comunicadoId);

      expect(await retract(sent, "Otro motivo")).toEqual({
        ok: false,
        code: "ALREADY_RETRACTED",
        message: "Este comunicado ya fue retirado.",
      });
      expect(await comunicadoOf(sent.comunicadoId)).toEqual(first);
    });

    it("refuses a draft, a scheduled comunicado and one that does not exist", async () => {
      const authorId = await createUser("admin");
      const draft = await integrationDb!
        .insert(comunicados)
        .values({ createdByUserId: authorId, updatedByUserId: authorId })
        .returning({ id: comunicados.id });
      const scheduled = await integrationDb!
        .insert(comunicados)
        .values({
          status: "scheduled",
          scheduledAt: new Date(Date.now() + 86_400_000),
          scheduledByUserId: authorId,
          createdByUserId: authorId,
          updatedByUserId: authorId,
        })
        .returning({ id: comunicados.id });
      created.comunicados.push(draft[0]!.id, scheduled[0]!.id);

      for (const id of [draft[0]!.id, scheduled[0]!.id]) {
        expect(
          await retractMod.retractComunicado(id, { reason: REASON }, authorId),
        ).toEqual({
          ok: false,
          code: "NOT_SENT",
          message: "Este comunicado no se envió.",
        });
        expect((await comunicadoOf(id)).retracted_at).toBeNull();
      }
      expect(
        await retractMod.retractComunicado(
          MISSING_ID,
          { reason: REASON },
          authorId,
        ),
      ).toEqual({
        ok: false,
        code: "NOT_FOUND",
        message: "No encontramos este comunicado.",
      });
    });

    it("retries a deadlock once, and answers a second one or a lock timeout without retracting", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);
      const transaction = vi.spyOn(appDb, "transaction");

      transaction
        .mockRejectedValueOnce(deadlock())
        .mockRejectedValueOnce(deadlock());
      expect(await retract(sent)).toEqual({
        ok: false,
        code: "BUSY",
        message: "No pudimos retirarlo. Probá de nuevo.",
      });
      expect(transaction).toHaveBeenCalledTimes(2);

      transaction.mockClear();
      transaction.mockRejectedValueOnce(
        Object.assign(new Error("canceling statement due to lock timeout"), {
          code: "55P03",
        }),
      );
      expect(await retract(sent)).toEqual({
        ok: false,
        code: "LOCKED",
        message:
          "Se están enviando correos de este comunicado en este momento. Probá de nuevo en unos segundos.",
      });
      expect(transaction).toHaveBeenCalledTimes(1);

      transaction.mockClear();
      transaction.mockRejectedValueOnce(new Error("connection lost"));
      await expect(retract(sent)).rejects.toThrow("connection lost");
      expect(transaction).toHaveBeenCalledTimes(1);
      expect((await comunicadoOf(sent.comunicadoId)).retracted_at).toBeNull();

      transaction.mockClear();
      transaction.mockRejectedValueOnce(deadlock());
      expect(await retract(sent)).toMatchObject({ ok: true });
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(
        (await comunicadoOf(sent.comunicadoId)).retracted_at,
      ).not.toBeNull();
    });
  });

  describe("the action", () => {
    it("retracts for a global admin with the flag, and refreshes the list and the page", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);
      state.viewer = { id: await createUser("admin"), role: "admin" };

      expect(
        await retractActions.retractComunicadoAction({
          comunicadoId: sent.comunicadoId,
          reason: `  ${REASON}  `,
        }),
      ).toEqual({
        success: true,
        message: "Lo retiramos de las notificaciones.",
      });
      expect(await comunicadoOf(sent.comunicadoId)).toMatchObject({
        retracted_by_user_id: state.viewer.id,
        retract_reason: REASON,
      });
      expect(revalidatePath.mock.calls).toEqual([
        ["/dashboard/communications"],
        [`/dashboard/communications/${sent.comunicadoId}`],
      ]);
    });

    it("refuses a festival admin, and anyone while the flag is off", async () => {
      const [person] = await createPeople(1);
      const sent = await insertSent({ people: [person!] });
      await fanOut(sent);
      const input = { comunicadoId: sent.comunicadoId, reason: REASON };

      state.viewer = {
        id: await createUser("festival_admin"),
        role: "festival_admin",
      };
      expect(await retractActions.retractComunicadoAction(input)).toEqual({
        success: false,
        message: "No autorizado.",
      });
      state.viewer = { id: await createUser("admin"), role: "admin" };
      state.flagOn = false;
      expect(await retractActions.retractComunicadoAction(input)).toEqual({
        success: false,
        message: "Esta funcionalidad no está disponible",
      });

      expect((await comunicadoOf(sent.comunicadoId)).retracted_at).toBeNull();
      expect((await itemOf(sent.campaignId, person!)).retracted_at).toBeNull();
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });
});
