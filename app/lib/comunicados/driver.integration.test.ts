// @vitest-environment node

import { createECDH, randomBytes, randomUUID } from "crypto";
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

import type { ComunicadoAudienceSummary } from "@/app/lib/comunicados/definitions";
import type { BulkTiming } from "@/app/lib/notifications/bulk-email";
import * as schema from "@/db/schema";
import {
  comunicadoRevisions,
  comunicados,
  notificationCampaigns,
  notifications,
  pushSubscriptions,
  users,
} from "@/db/schema";

/**
 * `runComunicadoWork` end to end against a real database
 * (docs/IMPLEMENTATION-comunicados.md D9): fan-out, bulk push, bulk email and
 * completion for one campaign, and lane-wide for this environment's
 * campaigns only. Resend and the push service are mocked at the network
 * call; everything else is real. A sent comunicado is inserted as the send
 * leaves it. Every assertion is about this file's own rows.
 */

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The two network calls: a batch to Resend, a push to the push service.
const sendBatchMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
  sendBatchEmails: sendBatchMock,
}));
const sendPushMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/vendors/web-push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/vendors/web-push")>()),
  sendPush: sendPushMock,
}));
type Vapid = { publicKey: string; privateKey: string; subject: string };
const vapid = vi.hoisted(() => ({ current: null as Vapid | null }));
vi.mock("@/app/lib/notifications/push/config", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/app/lib/notifications/push/config")
  >()),
  pushVapidConfig: () => vapid.current,
  pushPublicKey: () => vapid.current?.publicKey ?? null,
}));
// Avisos are on for everyone here; the flag rules have their own tests.
vi.mock("@/app/lib/feature_flags/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/feature_flags/data")>()),
  fetchFeatureFlagRule: async () => ({
    visibility: "public",
    targetedUserIds: [],
  }),
}));

const state = vi.hoisted(() => ({ vercelEnv: "production" }));
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

type Driver = typeof import("@/app/lib/comunicados/driver");
type Fanout = typeof import("@/app/lib/comunicados/fanout");
let driver: Driver;
let fanout: Fanout;

/** Older than anything else the database holds, so lane-wide reads take these first. */
const LONG_AGO = "2001-01-01T00:00:00Z";

/** No test waits on the production waits. */
const FAST: Partial<BulkTiming> = {
  spacingMs: 0,
  lockPollMs: 10,
  minLockTimeoutMs: 100,
  maxThrottleWaitMs: 10,
};

function vapidKeys(): Vapid {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey().toString("base64url"),
    // Node drops a private key's leading zero bytes; VAPID wants all 32.
    privateKey: Buffer.from(
      ecdh.getPrivateKey("hex").padStart(64, "0"),
      "hex",
    ).toString("base64url"),
    subject: "mailto:soporte@productoraglitter.com",
  };
}

const VAPID = vapidKeys();

const PUSHED = {
  statusCode: 201,
  headers: { location: "https://fcm.googleapis.com/fcm/send/msg-0:abc" },
};

const created = {
  users: [] as number[],
  campaigns: [] as number[],
  comunicados: [] as number[],
};

type Env = ComunicadoAudienceSummary["env"];
type Source = "list" | "person" | "staging_admin";

async function createUser(): Promise<number> {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `driver-it-${suffix}`,
      email: `driver-it-${suffix}@example.test`,
      firstName: "Ana",
      lastName: "Ilustra",
      role: "user",
      status: "verified",
    })
    .returning({ id: users.id });
  created.users.push(user!.id);
  return user!.id;
}

async function addDevice(userId: number) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  await integrationDb!.insert(pushSubscriptions).values({
    userId,
    endpoint: `https://fcm.googleapis.com/fcm/send/driver-it-${randomUUID()}`,
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
    applicationServerKey: VAPID.publicKey,
  });
}

function summaryFor(env: Env): ComunicadoAudienceSummary {
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
    channels: { email: true, push: true },
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

type Sent = { campaignId: number; comunicadoId: number };

/**
 * A comunicado as the send leaves it, email and push ticked: a processing
 * campaign written long ago, the sent row with its frozen summary, revision
 * 1, and one pending recipient per person.
 */
async function insertSent(
  env: Env,
  people: { userId: number; source: Source }[],
): Promise<Sent> {
  const author = await createUser();
  const campaign = await pool!.query<{ id: number }>(
    `INSERT INTO notification_campaigns
       (type, status, title, message, created_by_user_id, idempotency_key, created_at)
     VALUES ('comunicado', 'processing', 'Cambio de horario', 'El armado empieza a las 9.', $1, $2, $3)
     RETURNING id`,
    [author, `comunicado:test-${randomUUID()}`, LONG_AGO],
  );
  const campaignId = campaign.rows[0]!.id;
  created.campaigns.push(campaignId);
  const comunicado = await pool!.query<{ id: number }>(
    `INSERT INTO comunicados
       (status, title, campaign_id, current_revision, sent_at, sent_by_user_id,
        audience_summary, send_email, send_push, created_by_user_id, updated_by_user_id)
     VALUES ('sent', 'Cambio de horario', $1, 1, now(), $2, $3::jsonb, true, true, $2, $2)
     RETURNING id`,
    [campaignId, author, JSON.stringify(summaryFor(env))],
  );
  const comunicadoId = comunicado.rows[0]!.id;
  created.comunicados.push(comunicadoId);
  const text = "El armado empieza a las 9.";
  await pool!.query(
    `INSERT INTO comunicado_revisions
       (comunicado_id, revision, title, doc, html, text, created_by_user_id)
     VALUES ($1, 1, 'Cambio de horario', $2::jsonb, $3, $4, $5)`,
    [
      comunicadoId,
      JSON.stringify([
        {
          type: "paragraph",
          props: {},
          content: [{ type: "text", text, styles: {} }],
          children: [],
        },
      ]),
      `<p>${text}</p>`,
      text,
      author,
    ],
  );
  await addPending({ campaignId, comunicadoId }, people);
  return { campaignId, comunicadoId };
}

async function addPending(
  { campaignId }: Sent,
  people: { userId: number; source: Source }[],
) {
  await pool!.query(
    `INSERT INTO notification_campaign_recipients (campaign_id, user_id, status, source)
     SELECT $1, t.user_id, 'pending', t.source::campaign_recipient_source
     FROM unnest($2::int[], $3::text[]) AS t(user_id, source)`,
    [campaignId, people.map((p) => p.userId), people.map((p) => p.source)],
  );
}

async function recipientStatuses({ campaignId }: Sent) {
  const { rows } = await pool!.query<{ user_id: number; status: string }>(
    `SELECT user_id, status FROM notification_campaign_recipients
     WHERE campaign_id = $1 ORDER BY user_id`,
    [campaignId],
  );
  return Object.fromEntries(rows.map((row) => [row.user_id, row.status]));
}

type DeliveryRow = {
  user_id: number;
  channel: string;
  status: string;
  last_error: string | null;
  batch_key: string | null;
  attempts: number;
  content_revision: number | null;
  provider_message_id: string | null;
};

async function deliveriesOf({ campaignId }: Sent) {
  const { rows } = await pool!.query<DeliveryRow>(
    `SELECT d.user_id, d.channel, d.status, d.last_error, d.batch_key,
            d.attempts, d.content_revision, d.provider_message_id
     FROM notification_deliveries d
     JOIN notifications n ON n.id = d.notification_id
     WHERE n.campaign_id = $1
     ORDER BY d.user_id, d.channel`,
    [campaignId],
  );
  return rows;
}

async function campaignStatus({ campaignId }: Sent) {
  const { rows } = await pool!.query<{ status: string }>(
    "SELECT status FROM notification_campaigns WHERE id = $1",
    [campaignId],
  );
  return rows[0]!.status;
}

async function emailOf(userId: number) {
  const { rows } = await pool!.query<{ email: string }>(
    "SELECT email FROM users WHERE id = $1",
    [userId],
  );
  return rows[0]!.email;
}

/** Every address the mocked Resend was asked to mail, request by request. */
function batchAddresses() {
  return sendBatchMock.mock.calls.map(([emails]) =>
    (emails as { to: string[] }[]).flatMap((email) => email.to),
  );
}

const LATER = () => Date.now() + 60_000;

describeDatabase("runComunicadoWork", () => {
  let consoleError: MockInstance<typeof console.error>;
  let consoleWarn: MockInstance<typeof console.warn>;
  let consoleLog: MockInstance<typeof console.log>;

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    process.env.NEXT_PUBLIC_BASE_URL = "https://glitter.test";
    driver = await import("@/app/lib/comunicados/driver");
    fanout = await import("@/app/lib/comunicados/fanout");

    // The driver writes through the app's pool: it must be this database.
    const { db } = await import("@/db");
    const { rows } = await db.execute<{ name: string }>(
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
    vapid.current = VAPID;
    sendPushMock.mockReset();
    sendPushMock.mockResolvedValue(PUSHED);
    sendBatchMock.mockReset();
    sendBatchMock.mockImplementation(async (emails: unknown[]) => ({
      data: {
        data: emails.map(() => ({ id: `re_${randomUUID()}` })),
        errors: [],
      },
      error: null,
      headers: {},
    }));
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // The app's `db` logs every statement; the driver goes through it.
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
      // Their devices go with them.
      await db.delete(users).where(inArray(users.id, created.users));
    }
    for (const ids of Object.values(created)) ids.length = 0;
  }

  afterEach(async () => {
    // Read before cleanup, assert after it, so a failure still cleans up.
    const errors = consoleError.mock.calls.map((args) =>
      args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" "),
    );
    const lines = JSON.stringify([
      ...consoleWarn.mock.calls,
      ...consoleLog.mock.calls.filter((args) =>
        String(args[0]).startsWith("[comunicados]"),
      ),
    ]);
    // Every statement the app ran, with its params.
    const statements = JSON.stringify(consoleLog.mock.calls);
    consoleError.mockRestore();
    consoleWarn.mockRestore();
    consoleLog.mockRestore();
    state.vercelEnv = "production";
    vapid.current = null;
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

  it("for one send: fans out, pushes, emails and closes that campaign only", async () => {
    const [ana, bruno, carla] = [
      await createUser(),
      await createUser(),
      await createUser(),
    ];
    for (const person of [ana, carla]) await addDevice(person);
    // Another send of this environment, its push and email queued.
    const other = await insertSent("production", [
      { userId: carla, source: "list" },
    ]);
    await fanout.fanOutComunicado({ ...other, deadline: LATER() });
    const otherBefore = await deliveriesOf(other);
    const sent = await insertSent("production", [
      { userId: ana, source: "list" },
      { userId: bruno, source: "list" },
    ]);

    const result = await driver.runComunicadoWork({
      scope: { campaignId: sent.campaignId },
      deadline: LATER(),
      trigger: "send",
      emailTiming: FAST,
    });

    expect(result).toMatchObject({
      trigger: "send",
      env: "production",
      chunks: 1,
      notified: 2,
      skipped: 0,
      failed: 0,
      pushes: { scanned: 1, sent: 1 },
      email: { sent: 2, stopped: "idle" },
      emailSkipped: null,
      completed: 1,
      failedSteps: [],
    });
    expect(await recipientStatuses(sent)).toEqual({
      [ana]: "notified",
      [bruno]: "notified",
    });
    expect(
      (await deliveriesOf(sent)).map((row) => [
        row.user_id,
        row.channel,
        row.status,
        row.content_revision,
      ]),
    ).toEqual([
      [ana, "email", "sent", 1],
      [ana, "push", "sent", null],
      [bruno, "email", "sent", 1],
    ]);
    expect(sendPushMock).toHaveBeenCalledTimes(1);
    expect(await campaignStatus(sent)).toBe("completed");
    expect(await deliveriesOf(other)).toEqual(otherBefore);
    expect(await campaignStatus(other)).toBe("processing");
    expect(consoleLog).toHaveBeenCalledWith(
      "[comunicados] tick",
      expect.objectContaining({
        trigger: "send",
        chunks: 1,
        pushes: 1,
        batches: 1,
      }),
    );
  });

  it("lane-wide, moves only this environment's campaigns: recipients, pushes and emails", async () => {
    // Production's campaign, half fanned out by production: one person has
    // their item, push and email queued; another is still pending.
    const [ana, bruno, carla] = [
      await createUser(),
      await createUser(),
      await createUser(),
    ];
    for (const person of [ana, bruno, carla]) await addDevice(person);
    const production = await insertSent("production", [
      { userId: ana, source: "list" },
    ]);
    await fanout.fanOutComunicado({ ...production, deadline: LATER() });
    await addPending(production, [{ userId: bruno, source: "list" }]);
    const productionBefore = await deliveriesOf(production);
    expect(productionBefore.map((row) => [row.channel, row.status])).toEqual([
      ["email", "pending"],
      ["push", "pending"],
    ]);

    state.vercelEnv = "preview";
    const preview = await insertSent("preview", [
      { userId: carla, source: "person" },
    ]);

    const result = await driver.runComunicadoWork({
      scope: "lane",
      deadline: LATER(),
      trigger: "button",
      emailTiming: FAST,
    });

    expect(result).toMatchObject({
      trigger: "button",
      env: "preview",
      emailSkipped: null,
      failedSteps: [],
    });
    expect(await recipientStatuses(preview)).toEqual({ [carla]: "notified" });
    expect(
      (await deliveriesOf(preview)).map((row) => [row.channel, row.status]),
    ).toEqual([
      ["email", "sent"],
      ["push", "sent"],
    ]);
    expect(await campaignStatus(preview)).toBe("completed");

    expect(await recipientStatuses(production)).toEqual({
      [ana]: "notified",
      [bruno]: "pending",
    });
    expect(await deliveriesOf(production)).toEqual(productionBefore);
    expect(await campaignStatus(production)).toBe("processing");
    // Only carla's push and email went out from this run.
    expect(sendPushMock).toHaveBeenCalledTimes(1);
    expect(batchAddresses()).toEqual([[await emailOf(carla)]]);
  });

  it("lane-wide in development sends no email and expires nothing", async () => {
    const [ana, bruno] = [await createUser(), await createUser()];
    // Another environment's email, past its 20 hours.
    const production = await insertSent("production", [
      { userId: ana, source: "list" },
    ]);
    await fanout.fanOutComunicado({ ...production, deadline: LATER() });
    await pool!.query(
      `UPDATE notification_deliveries SET created_at = now() - interval '21 hours'
       WHERE notification_id IN (SELECT id FROM notifications WHERE campaign_id = $1)`,
      [production.campaignId],
    );
    const productionBefore = await deliveriesOf(production);

    state.vercelEnv = "development";
    const development = await insertSent("development", [
      { userId: bruno, source: "person" },
    ]);

    const result = await driver.runComunicadoWork({
      scope: "lane",
      deadline: LATER(),
      trigger: "cron",
      emailTiming: FAST,
    });

    expect(result).toMatchObject({
      env: "development",
      email: null,
      emailSkipped: "development",
      expired: 0,
      failedSteps: [],
    });
    expect(sendBatchMock).not.toHaveBeenCalled();
    // Its own fan-out still ran; its email waits for the send's own run.
    expect(await recipientStatuses(development)).toEqual({
      [bruno]: "notified",
    });
    expect(
      (await deliveriesOf(development)).map((row) => [
        row.channel,
        row.status,
        row.batch_key,
      ]),
    ).toEqual([["email", "pending", null]]);
    expect(await deliveriesOf(production)).toEqual(productionBefore);
  });

  it("for one send in development, sends simulated", async () => {
    const actual = await vi.importActual<typeof import("@/app/vendors/resend")>(
      "@/app/vendors/resend",
    );
    sendBatchMock.mockImplementation(actual.sendBatchEmails);
    state.vercelEnv = "development";
    const ana = await createUser();
    const sent = await insertSent("development", [
      { userId: ana, source: "person" },
    ]);

    const result = await driver.runComunicadoWork({
      scope: { campaignId: sent.campaignId },
      deadline: LATER(),
      trigger: "send",
      emailTiming: FAST,
    });

    expect(result).toMatchObject({
      env: "development",
      notified: 1,
      email: { sent: 1 },
      emailSkipped: null,
      completed: 1,
      failedSteps: [],
    });
    expect(sendBatchMock).toHaveBeenCalledTimes(1);
    expect(await deliveriesOf(sent)).toEqual([
      expect.objectContaining({
        channel: "email",
        status: "sent",
        last_error: "simulated",
        content_revision: 1,
        provider_message_id: null,
      }),
    ]);
    expect(await campaignStatus(sent)).toBe("completed");
  });
});
