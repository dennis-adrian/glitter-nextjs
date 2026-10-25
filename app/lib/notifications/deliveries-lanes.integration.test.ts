// @vitest-environment node

import { createECDH, randomBytes, randomUUID } from "crypto";
import { asc, eq, inArray, sql } from "drizzle-orm";
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
  notificationCampaigns,
  notificationDeliveries,
  notifications,
  pushSubscriptions,
  users,
} from "@/db/schema";

/**
 * The two delivery lanes against a real database: the transactional worker
 * never takes a bulk email, by drain or by id, while a bulk push is sent by
 * `sendBulkPushes` through the worker's own per-row path. Also the worker's
 * throttle rule for Resend's 429, and the push skip for a retracted item.
 *
 * No producer writes bulk rows yet, so the tests turn rows `notify()` wrote
 * into bulk ones. Resend and the push service are mocked; the reading of
 * their answers is real. Every row a test asserts on is its own.
 */

vi.mock("server-only", () => ({}));
const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/vendors/resend", () => ({ sendEmail: sendEmailMock }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));

// The one network call. `legacyParserAgrees` and the TTL stay real.
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 10 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Deliveries = typeof import("@/app/lib/notifications/deliveries");
type Notify = typeof import("@/app/lib/notifications/notify");
let deliveries: Deliveries;
let notifyModule: Notify;

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

const SENT = {
  statusCode: 201,
  headers: { location: "https://fcm.googleapis.com/fcm/send/msg-0:abc" },
};

function resendRefusal(
  name: string,
  headers: Record<string, string> | null = null,
) {
  return {
    data: null,
    error: { name, message: "Too many requests", statusCode: 429 },
    headers,
  };
}

function giftData() {
  return {
    campaignId: 1,
    name: "Ana",
    amount: 5,
    title: "Un regalo",
    message: "Gracias por el taller del sábado, Ana.",
  };
}

type Person = { id: number; email: string };

const createdUserIds: number[] = [];

async function createUser(role: "user" | "admin" = "user"): Promise<Person> {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `lanes-it-${suffix}`,
      email: `lanes-it-${suffix}@example.test`,
      displayName: `Ana ${suffix}`,
      firstName: "Ana",
      lastName: "Ilustra",
      role,
      status: "verified",
      category: role === "admin" ? "none" : "illustration",
    })
    .returning({ id: users.id, email: users.email });
  createdUserIds.push(user!.id);
  return user!;
}

async function addDevice(userId: number) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const [device] = await integrationDb!
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: `https://fcm.googleapis.com/fcm/send/lanes-it-${randomUUID()}`,
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
      applicationServerKey: VAPID.publicKey,
      deviceLabel: "Chrome en Windows",
    })
    .returning();
  return device!;
}

/** A campaign to scope bulk rows by; the type is the only label there is. */
async function createCampaign() {
  const admin = await createUser("admin");
  const [campaign] = await integrationDb!
    .insert(notificationCampaigns)
    .values({
      type: "credit_gift",
      title: "Cambio de horario",
      message: "El armado empieza a las 9.",
      createdByUserId: admin.id,
      idempotencyKey: randomUUID(),
    })
    .returning({ id: notificationCampaigns.id });
  return campaign!.id;
}

/** One inbox item through `notify()`: its email (when given) and pushes. */
async function notifyNow(input: {
  userId: number;
  email?: string;
  campaignId?: number;
}) {
  return integrationDb!.transaction((tx) =>
    notifyModule.notify(tx, {
      kind: "credit_gift_received",
      data: giftData(),
      dedupeKey: `lanes-it:${randomUUID()}`,
      ...input,
    }),
  );
}

/**
 * The same, with its deliveries moved to the bulk lane as a comunicado's
 * would be written (A1 of the comunicados design).
 */
async function notifyBulk(input: {
  userId: number;
  email?: string;
  campaignId?: number;
}) {
  const result = await notifyNow(input);
  await integrationDb!
    .update(notificationDeliveries)
    .set({
      lane: "bulk",
      templateKey: "comunicado",
      payload: sql`CASE WHEN ${notificationDeliveries.channel} = 'email'
        THEN '{"comunicadoId": 1}'::jsonb ELSE '{}'::jsonb END`,
    })
    .where(eq(notificationDeliveries.notificationId, result.notificationId));
  const rows = await deliveriesOfItem(result.notificationId);
  return {
    notificationId: result.notificationId,
    emailId: rows.find((row) => row.channel === "email")?.id,
    pushIds: rows.filter((row) => row.channel === "push").map((row) => row.id),
  };
}

async function deliveryById(id: number) {
  const [delivery] = await integrationDb!
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.id, id));
  if (!delivery) throw new Error(`Delivery ${id} not found`);
  return delivery;
}

async function deliveriesOfItem(notificationId: number) {
  return integrationDb!
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.notificationId, notificationId))
    .orderBy(asc(notificationDeliveries.id));
}

/**
 * The database's clock, in the frame Drizzle reads a `timestamp` column in:
 * the throttle rule times its wait on it, not on this process's clock.
 */
async function dbClockMs() {
  const { rows } = await pool!.query(
    "SELECT extract(epoch FROM now()::timestamp) * 1000 AS ms",
  );
  return Number(rows[0].ms);
}

function expectAbout(actual: Date | null, expectedMs: number, slackMs = 5_000) {
  expect(actual).not.toBeNull();
  expect(Math.abs(actual!.getTime() - expectedMs)).toBeLessThan(slackMs);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanUp() {
  if (createdUserIds.length === 0) return;
  const ids = [...createdUserIds];
  createdUserIds.length = 0;
  const db = integrationDb!;
  await db
    .delete(notificationCampaigns)
    .where(inArray(notificationCampaigns.createdByUserId, ids));
  // Deliveries go with their item; devices go with their user.
  await db.delete(notifications).where(inArray(notifications.userId, ids));
  await db
    .delete(notificationDeliveries)
    .where(inArray(notificationDeliveries.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
}

describeDatabase("delivery lanes", () => {
  let consoleError: MockInstance<typeof console.error>;
  let consoleLog: MockInstance<typeof console.log>;

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    deliveries = await import("@/app/lib/notifications/deliveries");
    notifyModule = await import("@/app/lib/notifications/notify");

    try {
      await integrationDb!
        .select({ lane: notificationDeliveries.lane })
        .from(notificationDeliveries)
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
    sendPushMock.mockResolvedValue(SENT);
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({
      data: { id: `re_${randomUUID()}` },
      error: null,
      headers: null,
    });
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    // The app's `db` logs every statement; the worker goes through it.
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    // Read before cleanup, assert after it, so a failure still cleans up.
    const errors = consoleError.mock.calls.map((args) =>
      args.map((arg) =>
        typeof arg === "string"
          ? arg
          : arg instanceof Error
            ? arg.message
            : JSON.stringify(arg),
      ),
    );
    consoleError.mockRestore();
    consoleLog.mockRestore();
    await cleanUp();
    expect(errors).toEqual([]);
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
  });

  describe("the transactional worker", () => {
    it("drains its own email and push and never claims a bulk row", async () => {
      const ana = await createUser();
      await addDevice(ana.id);
      const bulk = await notifyBulk({ userId: ana.id, email: ana.email });
      const transactional = await deliveriesOfItem(
        (await notifyNow({ userId: ana.id, email: ana.email })).notificationId,
      );
      const bulkIds = [bulk.emailId!, ...bulk.pushIds];
      expect(bulk.pushIds).toHaveLength(1);
      const bulkBefore = await Promise.all(bulkIds.map(deliveryById));

      await deliveries.drainDuePushDeliveries();
      await deliveries.sendDuePushDeliveries({
        limit: 1_000,
        budgetMs: 10_000,
      });
      await deliveries.processPendingNotificationDeliveries({
        limit: 1_000,
        budgetMs: 10_000,
      });

      expect(
        (
          await Promise.all(transactional.map((row) => deliveryById(row.id)))
        ).map((row) => [row.channel, row.status]),
      ).toEqual([
        ["email", "sent"],
        ["push", "sent"],
      ]);
      expect(await Promise.all(bulkIds.map(deliveryById))).toEqual(bulkBefore);
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(sendEmailMock).toHaveBeenCalledWith(expect.anything(), {
        idempotencyKey: `notification-delivery-${transactional[0]!.id}`,
      });
      expect(sendPushMock).toHaveBeenCalledTimes(1);
    });

    it("keeps a bulk backlog out of the email queue's oldest-first places", async () => {
      const ana = await createUser();
      const bulk = await notifyBulk({ userId: ana.id, email: ana.email });
      const {
        deliveryIds: [emailId],
      } = await notifyNow({ userId: ana.id, email: ana.email });
      // Older than anything another test leaves due, so a one-row drain
      // would take the bulk row first if it could see it.
      await integrationDb!
        .update(notificationDeliveries)
        .set({
          createdAt: sql`now() - CASE WHEN ${notificationDeliveries.id} = ${bulk.emailId!}
            THEN interval '30 days' ELSE interval '29 days' END`,
        })
        .where(inArray(notificationDeliveries.id, [bulk.emailId!, emailId!]));

      await deliveries.processPendingNotificationDeliveries({
        limit: 1,
        budgetMs: 10_000,
      });

      expect((await deliveryById(emailId!)).status).toBe("sent");
      expect((await deliveryById(bulk.emailId!)).status).toBe("pending");
    });

    it("refuses a bulk email handed over by id, even one whose lease ran out", async () => {
      const ana = await createUser();
      const { emailId } = await notifyBulk({
        userId: ana.id,
        email: ana.email,
      });
      const pending = await deliveryById(emailId!);

      expect(await deliveries.attemptNotificationDelivery(emailId!)).toEqual({
        processed: false,
      });
      expect(
        await deliveries.sendNotificationDeliveries([emailId!], 10_000),
      ).toEqual({ sent: 0, skipped: 0, failed: 0, retry: 0 });
      expect(await deliveryById(emailId!)).toEqual(pending);

      // The other arm of `dueNow`: an attempt that never settled.
      await integrationDb!
        .update(notificationDeliveries)
        .set({
          status: "processing",
          leaseOwner: "crashed",
          leaseExpiresAt: sql`now() - interval '1 minute'`,
        })
        .where(eq(notificationDeliveries.id, emailId!));
      expect(await deliveries.attemptNotificationDelivery(emailId!)).toEqual({
        processed: false,
      });
      expect(await deliveryById(emailId!)).toMatchObject({
        status: "processing",
        leaseOwner: "crashed",
        attempts: 0,
      });
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("sends a bulk push handed over by id, as any push", async () => {
      const ana = await createUser();
      await addDevice(ana.id);
      const {
        pushIds: [pushId],
      } = await notifyBulk({ userId: ana.id });

      expect(await deliveries.attemptNotificationDelivery(pushId!)).toEqual({
        processed: true,
        status: "sent",
      });
      expect(await deliveryById(pushId!)).toMatchObject({
        lane: "bulk",
        status: "sent",
        providerMessageId: SENT.headers.location,
        attempts: 0,
        leaseOwner: null,
      });
      expect(sendPushMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("Resend throttling an email", () => {
    async function queueEmail() {
      const ana = await createUser();
      const result = await notifyNow({ userId: ana.id, email: ana.email });
      return result.deliveryIds[0]!;
    }

    it.each([
      { retryAfter: "7", waitMs: 7_000 },
      { retryAfter: "1", waitMs: 2_000 },
      { retryAfter: null, waitMs: 2_000 },
    ])(
      "puts it back unspent for max(2 s, Retry-After $retryAfter) on the database clock",
      async ({ retryAfter, waitMs }) => {
        const emailId = await queueEmail();
        sendEmailMock.mockResolvedValue(
          resendRefusal(
            "rate_limit_exceeded",
            retryAfter == null ? null : { "retry-after": retryAfter },
          ),
        );

        const before = await dbClockMs();
        expect(await deliveries.attemptNotificationDelivery(emailId)).toEqual({
          processed: true,
          status: "retry",
        });
        const after = await dbClockMs();

        const row = await deliveryById(emailId);
        expect(row).toMatchObject({
          status: "pending",
          attempts: 0,
          lastError: "resend:rate_limit_exceeded",
          leaseOwner: null,
          leaseExpiresAt: null,
          sentAt: null,
        });
        // Postgres keeps microseconds; a Date keeps whole milliseconds.
        expect(row.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
          Math.floor(before) + waitMs,
        );
        expect(row.nextAttemptAt.getTime()).toBeLessThanOrEqual(
          Math.ceil(after) + waitMs,
        );
        expect(sendEmailMock).toHaveBeenCalledTimes(1);
      },
    );

    it("never fails an email on its last attempt for a throttle", async () => {
      const emailId = await queueEmail();
      await integrationDb!
        .update(notificationDeliveries)
        .set({ attempts: 4 })
        .where(eq(notificationDeliveries.id, emailId));
      sendEmailMock.mockResolvedValue(resendRefusal("rate_limit_exceeded"));

      expect(await deliveries.attemptNotificationDelivery(emailId)).toEqual({
        processed: true,
        status: "retry",
      });
      expect(await deliveryById(emailId)).toMatchObject({
        status: "pending",
        attempts: 4,
      });
    });

    it("spends an attempt on one written more than 20 hours ago, as before", async () => {
      const emailId = await queueEmail();
      await integrationDb!
        .update(notificationDeliveries)
        .set({ createdAt: sql`now() - interval '21 hours'` })
        .where(eq(notificationDeliveries.id, emailId));
      sendEmailMock.mockResolvedValue(
        resendRefusal("rate_limit_exceeded", { "retry-after": "7" }),
      );

      const before = Date.now();
      expect(await deliveries.attemptNotificationDelivery(emailId)).toEqual({
        processed: true,
        status: "retry",
      });

      const row = await deliveryById(emailId);
      expect(row).toMatchObject({
        status: "pending",
        attempts: 1,
        lastError: "resend:rate_limit_exceeded",
        leaseOwner: null,
      });
      expectAbout(row.nextAttemptAt, before + 30_000);
    });

    it("spends an attempt on a quota refusal, which is not a throttle", async () => {
      const emailId = await queueEmail();
      sendEmailMock.mockResolvedValue(
        resendRefusal("daily_quota_exceeded", { "retry-after": "7" }),
      );

      const before = Date.now();
      expect(await deliveries.attemptNotificationDelivery(emailId)).toEqual({
        processed: true,
        status: "retry",
      });

      const row = await deliveryById(emailId);
      expect(row).toMatchObject({
        status: "pending",
        attempts: 1,
        lastError: "resend:daily_quota_exceeded",
      });
      expectAbout(row.nextAttemptAt, before + 30_000);
    });
  });

  describe("sendBulkPushes", () => {
    it("returns at once on a server without VAPID keys, and touches nothing", async () => {
      const campaignId = await createCampaign();
      const ana = await createUser();
      await addDevice(ana.id);
      const {
        pushIds: [pushId],
      } = await notifyBulk({ userId: ana.id, campaignId });
      const pending = await deliveryById(pushId!);
      vapid.current = null;

      expect(
        await deliveries.sendBulkPushes({ campaignId, budgetMs: 10_000 }),
      ).toEqual({ scanned: 0, sent: 0, skipped: 0, failed: 0, retry: 0 });
      expect(await deliveryById(pushId!)).toEqual(pending);
      expect(sendPushMock).not.toHaveBeenCalled();
    });

    it("sends one campaign's bulk pushes, then the lane's, and never a transactional push", async () => {
      const [first, second] = [await createCampaign(), await createCampaign()];
      const [ana, bruno, carla] = [
        await createUser(),
        await createUser(),
        await createUser(),
      ];
      for (const person of [ana, bruno, carla]) await addDevice(person.id);
      const anaBulk = await notifyBulk({ userId: ana.id, campaignId: first });
      const brunoBulk = await notifyBulk({
        userId: bruno.id,
        campaignId: first,
      });
      const carlaBulk = await notifyBulk({
        userId: carla.id,
        campaignId: second,
      });
      const {
        deliveryIds: [transactionalId],
      } = await notifyNow({ userId: ana.id, campaignId: first });

      expect(
        await deliveries.sendBulkPushes({
          campaignId: first,
          budgetMs: 10_000,
        }),
      ).toEqual({ scanned: 2, sent: 2, skipped: 0, failed: 0, retry: 0 });
      expect((await deliveryById(anaBulk.pushIds[0]!)).status).toBe("sent");
      expect((await deliveryById(brunoBulk.pushIds[0]!)).status).toBe("sent");
      expect((await deliveryById(carlaBulk.pushIds[0]!)).status).toBe(
        "pending",
      );

      // Lane-wide: whatever else is due in this database goes too.
      await deliveries.sendBulkPushes({ budgetMs: 10_000 });
      expect((await deliveryById(carlaBulk.pushIds[0]!)).status).toBe("sent");
      expect(await deliveryById(transactionalId!)).toMatchObject({
        lane: "transactional",
        status: "pending",
        attempts: 0,
        leaseOwner: null,
      });
    });

    it("takes only the rows a scope on the inbox item admits", async () => {
      const campaignId = await createCampaign();
      const [ana, bruno] = [await createUser(), await createUser()];
      for (const person of [ana, bruno]) await addDevice(person.id);
      const anaBulk = await notifyBulk({ userId: ana.id, campaignId });
      const brunoBulk = await notifyBulk({ userId: bruno.id, campaignId });

      expect(
        await deliveries.sendBulkPushes({
          campaignId,
          scope: eq(notifications.userId, bruno.id),
          budgetMs: 10_000,
        }),
      ).toEqual({ scanned: 1, sent: 1, skipped: 0, failed: 0, retry: 0 });
      expect((await deliveryById(anaBulk.pushIds[0]!)).status).toBe("pending");
      expect((await deliveryById(brunoBulk.pushIds[0]!)).status).toBe("sent");
    });

    async function bulkPushes(count: number) {
      const campaignId = await createCampaign();
      const ana = await createUser();
      for (let i = 0; i < count; i += 1) await addDevice(ana.id);
      const { pushIds } = await notifyBulk({ userId: ana.id, campaignId });
      expect(pushIds).toHaveLength(count);
      return { campaignId, pushIds };
    }

    /** A push service that answers after `ms`, counting what is in flight. */
    function slowPushService(ms: number) {
      const seen = { inFlight: 0, most: 0 };
      sendPushMock.mockImplementation(async () => {
        seen.inFlight += 1;
        seen.most = Math.max(seen.most, seen.inFlight);
        await sleep(ms);
        seen.inFlight -= 1;
        return SENT;
      });
      return seen;
    }

    it("keeps eight pushes in flight by default, with no wait between them", async () => {
      const { campaignId } = await bulkPushes(10);
      const seen = slowPushService(100);

      expect(
        await deliveries.sendBulkPushes({ campaignId, budgetMs: 10_000 }),
      ).toEqual({ scanned: 10, sent: 10, skipped: 0, failed: 0, retry: 0 });
      expect(seen.most).toBe(deliveries.BULK_PUSH_CONCURRENCY);
      expect(deliveries.BULK_PUSH_CONCURRENCY).toBe(8);
    });

    it("keeps at most `concurrency` in flight and starts nothing once the budget is spent", async () => {
      const { campaignId, pushIds } = await bulkPushes(6);
      const seen = slowPushService(400);

      // Two at once: the first pair lands well inside 600 ms and the second
      // starts; once it lands the budget is spent, and the last two wait.
      expect(
        await deliveries.sendBulkPushes({
          campaignId,
          budgetMs: 600,
          concurrency: 2,
        }),
      ).toEqual({ scanned: 6, sent: 4, skipped: 0, failed: 0, retry: 0 });
      expect(seen.most).toBe(2);
      const rows = await Promise.all(pushIds.map(deliveryById));
      expect(rows.map((row) => row.status)).toEqual([
        "sent",
        "sent",
        "sent",
        "sent",
        "pending",
        "pending",
      ]);
      expect(rows.slice(4)).toMatchObject([
        { attempts: 0, leaseOwner: null },
        { attempts: 0, leaseOwner: null },
      ]);

      expect(
        await deliveries.sendBulkPushes({ campaignId, budgetMs: 0 }),
      ).toEqual({ scanned: 2, sent: 0, skipped: 0, failed: 0, retry: 0 });
      expect(sendPushMock).toHaveBeenCalledTimes(4);
    });
  });

  it("skips a push whose item was retracted as retracted, not archived", async () => {
    const campaignId = await createCampaign();
    const [ana, bruno] = [await createUser(), await createUser()];
    for (const person of [ana, bruno]) await addDevice(person.id);
    const bulk = await notifyBulk({ userId: ana.id, campaignId });
    const transactional = await notifyNow({ userId: bruno.id });
    await integrationDb!
      .update(notifications)
      .set({ archivedAt: sql`now()`, retractedAt: sql`now()` })
      .where(
        inArray(notifications.id, [
          bulk.notificationId,
          transactional.notificationId,
        ]),
      );

    expect(
      await deliveries.sendBulkPushes({ campaignId, budgetMs: 10_000 }),
    ).toEqual({ scanned: 1, sent: 0, skipped: 1, failed: 0, retry: 0 });
    expect(
      await deliveries.attemptNotificationDelivery(
        transactional.deliveryIds[0]!,
      ),
    ).toEqual({ processed: true, status: "skipped" });

    for (const id of [bulk.pushIds[0]!, transactional.deliveryIds[0]!]) {
      expect(await deliveryById(id)).toMatchObject({
        status: "skipped",
        lastError: "retracted",
        attempts: 0,
        sentAt: null,
      });
    }
    expect(sendPushMock).not.toHaveBeenCalled();
  });
});
