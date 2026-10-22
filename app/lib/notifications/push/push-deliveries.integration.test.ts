// @vitest-environment node

import { createECDH, randomBytes, randomUUID } from "crypto";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import webpush from "web-push";
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

import type {
  NotificationData,
  NotificationKind,
} from "@/app/lib/notifications/registry";
import * as schema from "@/db/schema";
import {
  creditAccounts,
  notificationCampaignRecipients,
  notificationCampaigns,
  notificationDeliveries,
  notifications,
  pendingUserDeletions,
  pushSubscriptions,
  users,
} from "@/db/schema";

/**
 * Web push (P2b of docs/PRD-in-app-notifications.md) against a real database:
 * `notify()` queues one push per device in the caller's transaction, the
 * worker sends it built from the inbox item as it is now and settles the row
 * from the push service's answer, and the device helpers keep the table
 * honest. The push service is mocked (`sendPush`); classification is real.
 *
 * Every test watches console.error, and every row it asserts on is its own.
 */

vi.mock("server-only", () => ({}));
// Email sends go through this mock; nothing here reaches Resend.
const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/vendors/resend", () => ({ sendEmail: sendEmailMock }));
// The gift pages resolve the viewer from Clerk; tests set it here instead.
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));
const currentProfile = vi.hoisted(() => ({
  value: null as { id: number; role: string } | null,
}));
vi.mock("@/app/lib/users/helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/users/helpers")>()),
  getCurrentUserProfile: async () => currentProfile.value,
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

type FlagRule = {
  visibility: "hidden" | "admin_only" | "public";
  targetedUserIds: number[];
};
type PushFlags = { notifications: FlagRule; push_notifications: FlagRule };
const flags = vi.hoisted(() => ({ rules: null as PushFlags | null }));
vi.mock("@/app/lib/feature_flags/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/feature_flags/data")>()),
  fetchFeatureFlagRule: async (key: string) =>
    flags.rules?.[key as keyof PushFlags] ?? {
      visibility: "hidden",
      targetedUserIds: [],
    },
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
type Devices = typeof import("@/app/lib/notifications/push/devices");
type GiftService = typeof import("@/app/lib/credit_gifts/service");
type GiftQueries = typeof import("@/app/lib/credit_gifts/queries");
let deliveries: Deliveries;
let notifyModule: Notify;
let devices: Devices;
let gifts: GiftService;
let giftQueries: GiftQueries;

const PUBLIC: FlagRule = { visibility: "public", targetedUserIds: [] };

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

/** The keys a browser's `PushSubscription.toJSON()` hands over. */
function browserKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
}

const VAPID = vapidKeys();
const OTHER_VAPID = vapidKeys();

function fcmEndpoint() {
  return `https://fcm.googleapis.com/fcm/send/push-it-${randomUUID()}`;
}

function appleEndpoint() {
  return `https://web.push.apple.com/push-it-${randomUUID()}`;
}

const SENT = {
  statusCode: 201,
  headers: { location: "https://fcm.googleapis.com/fcm/send/msg-0:abc" },
};

/** What `web-push` rejects with for a non-2xx answer. */
function webPushError(
  statusCode: number,
  headers: Record<string, string> = {},
) {
  return new webpush.WebPushError(
    "Received unexpected response code",
    statusCode,
    headers,
    "",
    "https://fcm.googleapis.com/fcm/send/elsewhere",
  );
}

const GIFT_MESSAGE = "Gracias por el taller del sábado, Ana. Es solo para vos.";

function giftData() {
  return {
    campaignId: 1,
    name: "Ana",
    amount: 5,
    title: "Un regalo",
    message: GIFT_MESSAGE,
  };
}

function proofData(profileId: number, selfSubmitted: boolean) {
  return {
    reservationId: 9001,
    festivalId: 9001,
    festivalName: "Glitter Invierno",
    standLabel: "B48",
    standCount: 1,
    profileId,
    selfSubmitted,
  };
}

function adminReservationData() {
  return {
    reservationId: 9001,
    festivalId: 9001,
    festivalName: "Glitter Invierno",
    standLabel: "B48",
    standCount: 1,
    participantName: "Ana Ilustra",
    participantUserId: null,
  };
}

function giftInput(recipientIds: number[]) {
  return {
    recipientIds,
    amountPerRecipient: 20,
    occasion: "thanks" as const,
    title: "Un regalo para agradecerte",
    message: "¡Gracias por ser parte de Glitter, {nombre}!",
    internalNote: "Cortesía para el sector B",
    idempotencyKey: randomUUID(),
  };
}

type Person = { id: number; email: string; clerkId: string };

const createdUserIds: number[] = [];

async function createUser(role: "user" | "admin" = "user"): Promise<Person> {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `push-it-${suffix}`,
      email: `push-it-${suffix}@example.test`,
      displayName: role === "admin" ? `Admin ${suffix}` : `Ana ${suffix}`,
      firstName: "Ana",
      lastName: "Ilustra",
      role,
      status: "verified",
      category: role === "admin" ? "none" : "illustration",
    })
    .returning({ id: users.id, email: users.email, clerkId: users.clerkId });
  createdUserIds.push(user!.id);
  return user!;
}

async function addDevice(
  userId: number,
  overrides: Partial<typeof pushSubscriptions.$inferInsert> = {},
) {
  const [device] = await integrationDb!
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: fcmEndpoint(),
      ...browserKeys(),
      applicationServerKey: VAPID.publicKey,
      deviceLabel: "Chrome en Windows",
      ...overrides,
    })
    .returning();
  return device!;
}

async function deviceById(id: number) {
  const [device] = await integrationDb!
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.id, id));
  return device ?? null;
}

async function devicesOf(userId: number) {
  return integrationDb!
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(asc(pushSubscriptions.id));
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

async function deliveriesOfUser(userId: number) {
  return integrationDb!
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.userId, userId))
    .orderBy(asc(notificationDeliveries.id));
}

async function itemById(id: number) {
  const [item] = await integrationDb!
    .select()
    .from(notifications)
    .where(eq(notifications.id, id));
  if (!item) throw new Error(`Notification ${id} not found`);
  return item;
}

/** One inbox item through `notify()`, in a transaction that commits. */
async function notifyNow<K extends NotificationKind>(input: {
  userId: number;
  kind: K;
  data: NotificationData<K>;
  email?: string | null;
}) {
  return integrationDb!.transaction((tx) =>
    notifyModule.notify(tx, { dedupeKey: `push-it:${randomUUID()}`, ...input }),
  );
}

/** A gift notice without email: every delivery it returns is a push. */
async function queueGiftPush(userId: number) {
  const result = await notifyNow({
    userId,
    kind: "credit_gift_received",
    data: giftData(),
  });
  return { notificationId: result.notificationId, pushIds: result.deliveryIds };
}

function expectAbout(actual: Date | null, expectedMs: number, slackMs = 5_000) {
  expect(actual).not.toBeNull();
  expect(Math.abs(actual!.getTime() - expectedMs)).toBeLessThan(slackMs);
}

/** Resolves once some session waits on a lock that backend `pid` holds. */
async function waitUntilBlockedBy(pid: number, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await pool!.query(
      "SELECT pid FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))",
      [pid],
    );
    if (rows.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Nothing waited on backend ${pid}`);
}

async function backendPid(client: PoolClient) {
  const { rows } = await client.query("SELECT pg_backend_pid() AS pid");
  return Number(rows[0].pid);
}

async function cleanUp() {
  if (createdUserIds.length === 0) return;
  const ids = [...createdUserIds];
  createdUserIds.length = 0;
  const db = integrationDb!;

  const campaignRows = await db
    .select({ id: notificationCampaignRecipients.campaignId })
    .from(notificationCampaignRecipients)
    .where(inArray(notificationCampaignRecipients.userId, ids));
  const createdCampaigns = await db
    .select({ id: notificationCampaigns.id })
    .from(notificationCampaigns)
    .where(inArray(notificationCampaigns.createdByUserId, ids));
  const campaignIds = [
    ...new Set([...campaignRows, ...createdCampaigns].map((row) => row.id)),
  ];
  // Recipients hold the ledger entries, so they go first.
  if (campaignIds.length > 0) {
    await db
      .delete(notificationCampaigns)
      .where(inArray(notificationCampaigns.id, campaignIds));
  }
  // Deliveries go with their item; devices go with their user.
  await db.delete(notifications).where(inArray(notifications.userId, ids));
  await db
    .delete(notificationDeliveries)
    .where(inArray(notificationDeliveries.userId, ids));

  const { rows: ledger } = await pool!.query(
    "SELECT 1 FROM credit_ledger_entries WHERE user_id = ANY($1::int[]) LIMIT 1",
    [ids],
  );
  if (ledger.length > 0) {
    const client = await pool!.connect();
    try {
      await client.query(
        "ALTER TABLE credit_ledger_entries DISABLE TRIGGER credit_ledger_entries_append_only",
      );
      // Reversals point at the entries they undo: delete them first.
      await client.query(
        "DELETE FROM credit_ledger_entries WHERE user_id = ANY($1::int[]) AND reverses_entry_id IS NOT NULL",
        [ids],
      );
      await client.query(
        "DELETE FROM credit_ledger_entries WHERE user_id = ANY($1::int[])",
        [ids],
      );
    } finally {
      await client.query(
        "ALTER TABLE credit_ledger_entries ENABLE TRIGGER credit_ledger_entries_append_only",
      );
      client.release();
    }
  }
  await db.delete(creditAccounts).where(inArray(creditAccounts.userId, ids));
  await db
    .delete(pendingUserDeletions)
    .where(inArray(pendingUserDeletions.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
}

describeDatabase("web push deliveries", () => {
  let consoleError: MockInstance<typeof console.error>;
  let consoleLog: MockInstance<typeof console.log>;

  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    deliveries = await import("@/app/lib/notifications/deliveries");
    notifyModule = await import("@/app/lib/notifications/notify");
    devices = await import("@/app/lib/notifications/push/devices");
    gifts = await import("@/app/lib/credit_gifts/service");
    giftQueries = await import("@/app/lib/credit_gifts/queries");

    try {
      await integrationDb!
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
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
    flags.rules = { notifications: PUBLIC, push_notifications: PUBLIC };
    currentProfile.value = null;
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

  describe("notify() queues pushes with the inbox item", () => {
    it("queues one push per device of that person next to the email, and none to anyone else's devices", async () => {
      const ana = await createUser();
      const bruno = await createUser();
      const laptop = await addDevice(ana.id);
      const phone = await addDevice(ana.id, {
        endpoint: appleEndpoint(),
        deviceLabel: "iPhone",
      });
      await addDevice(bruno.id);

      const result = await notifyNow({
        userId: ana.id,
        kind: "credit_gift_received",
        data: giftData(),
        email: ana.email,
      });

      const rows = await deliveriesOfItem(result.notificationId);
      expect(result.created).toBe(true);
      expect(result.deliveryIds).toEqual(rows.map((row) => row.id));
      const [email, ...pushes] = rows;
      expect(email).toMatchObject({
        channel: "email",
        recipientEmail: ana.email,
        pushSubscriptionId: null,
        idempotencyKey: `notification:${result.notificationId}:email`,
      });
      expect(
        pushes.map((row) => ({
          userId: row.userId,
          templateKey: row.templateKey,
          channel: row.channel,
          recipientEmail: row.recipientEmail,
          pushSubscriptionId: row.pushSubscriptionId,
          payload: row.payload,
          idempotencyKey: row.idempotencyKey,
          status: row.status,
          attempts: row.attempts,
        })),
      ).toEqual(
        [laptop, phone].map((device) => ({
          userId: ana.id,
          templateKey: "credit_gift_received",
          channel: "push",
          recipientEmail: null,
          pushSubscriptionId: device.id,
          payload: {},
          idempotencyKey: `notification:${result.notificationId}:push:${device.id}`,
          status: "pending",
          attempts: 0,
        })),
      );
      expect(await deliveriesOfUser(bruno.id)).toEqual([]);
    });

    it("queues only the email for someone with no devices", async () => {
      const ana = await createUser();

      const result = await notifyNow({
        userId: ana.id,
        kind: "credit_gift_received",
        data: giftData(),
        email: ana.email,
      });

      const rows = await deliveriesOfItem(result.notificationId);
      expect(rows.map((row) => row.channel)).toEqual(["email"]);
      expect(result.deliveryIds).toEqual([rows[0]!.id]);
    });

    it("pushes nothing for a receipt that starts read, but does for a voucher an admin uploaded for them", async () => {
      const ana = await createUser();
      await addDevice(ana.id);

      const receipt = await notifyNow({
        userId: ana.id,
        kind: "reservation_proof_submitted",
        data: proofData(ana.id, true),
      });
      expect(receipt.deliveryIds).toEqual([]);
      expect(await deliveriesOfItem(receipt.notificationId)).toEqual([]);
      expect((await itemById(receipt.notificationId)).readAt).not.toBeNull();

      const byAdmin = await notifyNow({
        userId: ana.id,
        kind: "reservation_proof_submitted",
        data: proofData(ana.id, false),
      });
      const rows = await deliveriesOfItem(byAdmin.notificationId);
      expect(rows.map((row) => row.channel)).toEqual(["push"]);
      expect(byAdmin.deliveryIds).toEqual([rows[0]!.id]);
    });

    it("pushes nothing for an informational Administración copy, but does for one that asks for action", async () => {
      const admin = await createUser("admin");
      await addDevice(admin.id);

      const created = await notifyNow({
        userId: admin.id,
        kind: "reservation_created_admin",
        data: adminReservationData(),
      });
      expect(created.deliveryIds).toEqual([]);
      expect(await deliveriesOfItem(created.notificationId)).toEqual([]);

      const proof = await notifyNow({
        userId: admin.id,
        kind: "reservation_proof_submitted_admin",
        data: adminReservationData(),
      });
      expect(proof.deliveryIds).toHaveLength(1);
    });

    it("queues no second push when the same event notifies again", async () => {
      const ana = await createUser();
      await addDevice(ana.id);
      const input = {
        userId: ana.id,
        kind: "credit_gift_received" as const,
        data: giftData(),
        dedupeKey: `push-it:${randomUUID()}`,
      };

      const first = await integrationDb!.transaction((tx) =>
        notifyModule.notify(tx, input),
      );
      const again = await integrationDb!.transaction((tx) =>
        notifyModule.notify(tx, input),
      );

      expect(first.deliveryIds).toHaveLength(1);
      expect(again).toEqual({
        notificationId: first.notificationId,
        deliveryIds: [],
        created: false,
      });
      expect(await deliveriesOfItem(first.notificationId)).toHaveLength(1);
    });
  });

  describe("the delivery table", () => {
    it("refuses a push with an address and an email without one", async () => {
      const ana = await createUser();
      const { notificationId } = await notifyNow({
        userId: ana.id,
        kind: "credit_gift_received",
        data: giftData(),
      });
      const insert = (channel: string, email: string | null) =>
        pool!.query(
          `INSERT INTO notification_deliveries
             (notification_id, user_id, template_key, channel, recipient_email, idempotency_key)
           VALUES ($1, $2, 'credit_gift_received', $3, $4, $5)`,
          [notificationId, ana.id, channel, email, `push-it:${randomUUID()}`],
        );

      await expect(insert("push", ana.email)).rejects.toMatchObject({
        code: "23514",
        constraint: "notification_deliveries_recipient_per_channel",
      });
      await expect(insert("email", null)).rejects.toMatchObject({
        code: "23514",
        constraint: "notification_deliveries_recipient_per_channel",
      });
      expect(await deliveriesOfItem(notificationId)).toEqual([]);
    });

    it("files a delivery written without a channel as an email", async () => {
      const ana = await createUser();
      const { notificationId } = await notifyNow({
        userId: ana.id,
        kind: "credit_gift_received",
        data: giftData(),
      });

      await pool!.query(
        `INSERT INTO notification_deliveries
           (notification_id, user_id, template_key, recipient_email, idempotency_key)
         VALUES ($1, $2, 'credit_gift_received', $3, $4)`,
        [notificationId, ana.id, ana.email, `push-it:${randomUUID()}`],
      );

      const [row] = await deliveriesOfItem(notificationId);
      expect(row).toMatchObject({ channel: "email", pushSubscriptionId: null });
    });
  });

  describe("sending a push", () => {
    it("marks it sent with the push service's message id and bumps the device's last use", async () => {
      const ana = await createUser();
      const device = await addDevice(ana.id, {
        lastUsedAt: new Date(Date.now() - 3 * 86_400_000),
      });
      const {
        notificationId,
        pushIds: [pushId],
      } = await queueGiftPush(ana.id);

      const outcome = await deliveries.attemptNotificationDelivery(pushId!);

      expect(outcome).toEqual({ processed: true, status: "sent" });
      const row = await deliveryById(pushId!);
      expect(row).toMatchObject({
        status: "sent",
        providerMessageId: SENT.headers.location,
        lastError: null,
        attempts: 0,
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      expectAbout(row.sentAt, Date.now());
      expectAbout((await deviceById(device.id))!.lastUsedAt, Date.now());

      expect(sendPushMock).toHaveBeenCalledTimes(1);
      const [target, payload, options] = sendPushMock.mock.calls[0]!;
      expect(target).toEqual({
        endpoint: device.endpoint,
        keys: { p256dh: device.p256dh, auth: device.auth },
      });
      expect(options).toMatchObject({
        vapid: VAPID,
        topic: `n${notificationId}`,
      });
      // A fresh push keeps (almost) all of its 48 hours.
      expect(options.ttlSeconds).toBeGreaterThan(172_700);
      expect(options.ttlSeconds).toBeLessThanOrEqual(172_800);
      const item = await itemById(notificationId);
      expect(JSON.parse(payload)).toEqual({
        v: 1,
        id: notificationId,
        title: item.title,
        // The gift's message is someone's words: it stays on its page.
        body: "Tocá para ver el detalle.",
        url: `/my_notifications/${notificationId}`,
        tag: `notification-${notificationId}`,
      });
      expect(payload).not.toContain(GIFT_MESSAGE);
      expect(payload).not.toContain("taller");

      // Sent is final: another drain does not send it again.
      expect(await deliveries.attemptNotificationDelivery(pushId!)).toEqual({
        processed: false,
      });
      expect(sendPushMock).toHaveBeenCalledTimes(1);
    });

    it("says only that something arrived for a disciplinary notice, and keeps Apple's message id", async () => {
      const ana = await createUser();
      await addDevice(ana.id, { endpoint: appleEndpoint() });
      sendPushMock.mockResolvedValue({
        statusCode: 201,
        headers: { "apns-id": "apns-4F1C" },
      });
      const {
        notificationId,
        deliveryIds: [pushId],
      } = await notifyNow({
        userId: ana.id,
        kind: "infraction_registered",
        data: {
          infractionId: 77,
          profileId: ana.id,
          typeLabel: "Llegada tarde al montaje",
          festivalName: "Glitter Invierno",
          note: null,
        },
      });

      expect(await deliveries.attemptNotificationDelivery(pushId!)).toEqual({
        processed: true,
        status: "sent",
      });

      const payload: string = sendPushMock.mock.calls[0]![1];
      expect(JSON.parse(payload)).toEqual({
        v: 1,
        id: notificationId,
        title: "Glitter",
        body: "Tenés una notificación nueva",
        url: `/my_notifications/${notificationId}`,
        tag: `notification-${notificationId}`,
      });
      expect(payload).not.toContain("Llegada tarde");
      expect(payload).not.toContain("Glitter Invierno");
      expect(await deliveryById(pushId!)).toMatchObject({
        status: "sent",
        providerMessageId: "apns-4F1C",
      });
    });

    it("shows the item's own title and text when nobody wrote any of it", async () => {
      const ana = await createUser();
      await addDevice(ana.id);
      const {
        notificationId,
        deliveryIds: [pushId],
      } = await notifyNow({
        userId: ana.id,
        kind: "reservation_confirmed",
        data: {
          reservationId: 7,
          festivalId: 3,
          festivalName: "Glitter Vol. 9",
          standLabel: "B48",
          standCount: 1,
          profileId: ana.id,
          startsAt: null,
          locationLabel: null,
        },
      });

      await deliveries.attemptNotificationDelivery(pushId!);

      const item = await itemById(notificationId);
      expect(JSON.parse(sendPushMock.mock.calls[0]![1])).toMatchObject({
        title: item.title,
        body: item.body,
      });
    });

    it("keeps a revoked gift's admin-written title and the debt off the lock screen", async () => {
      const ana = await createUser();
      await addDevice(ana.id);
      const {
        notificationId,
        deliveryIds: [pushId],
      } = await notifyNow({
        userId: ana.id,
        kind: "credit_gift_revoked",
        data: {
          campaignId: 1,
          name: "Ana",
          amount: 5,
          title: "Compensación por el error en tu cobro",
          debtAmount: 3,
        },
      });

      await deliveries.attemptNotificationDelivery(pushId!);

      const item = await itemById(notificationId);
      const pushed = sendPushMock.mock.calls[0]![1];
      expect(JSON.parse(pushed)).toMatchObject({
        title: item.title,
        body: "Tocá para ver el detalle.",
      });
      expect(pushed).not.toContain("Compensación");
      expect(pushed).not.toContain("saldo pendiente");
    });

    it.each([410, 404])(
      "drops a device the push service answers %i for, and keeps its push as history",
      async (statusCode) => {
        const ana = await createUser();
        const device = await addDevice(ana.id);
        const {
          pushIds: [pushId],
        } = await queueGiftPush(ana.id);
        sendPushMock.mockRejectedValue(webPushError(statusCode));

        expect(await deliveries.attemptNotificationDelivery(pushId!)).toEqual({
          processed: true,
          status: "skipped",
        });

        expect(await deliveryById(pushId!)).toMatchObject({
          status: "skipped",
          lastError: `push_${statusCode}`,
          attempts: 0,
          pushSubscriptionId: null,
          leaseOwner: null,
        });
        expect(await deviceById(device.id)).toBeNull();
      },
    );

    it("keeps a device that subscribed again with new keys while the push was out", async () => {
      const ana = await createUser();
      const device = await addDevice(ana.id);
      const {
        pushIds: [pushId],
      } = await queueGiftPush(ana.id);
      const renewed = browserKeys();
      sendPushMock.mockImplementation(async () => {
        await integrationDb!
          .update(pushSubscriptions)
          .set(renewed)
          .where(eq(pushSubscriptions.id, device.id));
        throw webPushError(410);
      });

      await deliveries.attemptNotificationDelivery(pushId!);

      expect(await deliveryById(pushId!)).toMatchObject({
        status: "skipped",
        lastError: "push_410",
      });
      expect(await deviceById(device.id)).toMatchObject(renewed);
    });

    it("waits as long as a throttling push service asks, without spending an attempt", async () => {
      const ana = await createUser();
      await addDevice(ana.id);
      const {
        pushIds: [pushId],
      } = await queueGiftPush(ana.id);
      sendPushMock.mockRejectedValue(
        webPushError(429, { "retry-after": "120" }),
      );

      const before = Date.now();
      expect(await deliveries.attemptNotificationDelivery(pushId!)).toEqual({
        processed: true,
        status: "retry",
      });

      const row = await deliveryById(pushId!);
      expect(row).toMatchObject({
        status: "pending",
        attempts: 0,
        lastError: "push_429",
        leaseOwner: null,
      });
      expectAbout(row.nextAttemptAt, before + 120_000);
    });

    it("retries a push service error with backoff, and gives up after the fifth attempt", async () => {
      const ana = await createUser();
      await addDevice(ana.id);
      const {
        pushIds: [pushId],
      } = await queueGiftPush(ana.id);
      sendPushMock.mockRejectedValue(webPushError(500));

      const before = Date.now();
      expect(await deliveries.attemptNotificationDelivery(pushId!)).toEqual({
        processed: true,
        status: "retry",
      });
      const retried = await deliveryById(pushId!);
      expect(retried).toMatchObject({
        status: "pending",
        attempts: 1,
        lastError: "push_500",
      });
      expectAbout(retried.nextAttemptAt, before + 30_000);

      await integrationDb!
        .update(notificationDeliveries)
        .set({ attempts: 4, nextAttemptAt: sql`now()` })
        .where(eq(notificationDeliveries.id, pushId!));
      expect(await deliveries.attemptNotificationDelivery(pushId!)).toEqual({
        processed: true,
        status: "failed",
      });
      expect(await deliveryById(pushId!)).toMatchObject({
        status: "failed",
        attempts: 5,
        lastError: "push_500",
      });
      expect(sendPushMock).toHaveBeenCalledTimes(2);
    });

    it("retries a push that got no answer, recording only the kind of failure", async () => {
      const ana = await createUser();
      const hungUp = await addDevice(ana.id);
      await addDevice(ana.id);
      const { pushIds } = await queueGiftPush(ana.id);
      sendPushMock.mockImplementation(async (target: { endpoint: string }) => {
        throw new Error(
          target.endpoint === hungUp.endpoint
            ? `socket hang up ${target.endpoint}`
            : "Socket timeout",
        );
      });

      await deliveries.sendNotificationDeliveries(pushIds, 30_000);

      const rows = await Promise.all(pushIds.map((id) => deliveryById(id)));
      expect(
        rows.map((row) => [row.status, row.attempts, row.lastError]),
      ).toEqual([
        ["pending", 1, "push_network"],
        ["pending", 1, "push_timeout"],
      ]);
    });

    it("fails a push the service refuses for good, keeps the device, and logs only the host", async () => {
      const ana = await createUser();
      const device = await addDevice(ana.id);
      const {
        pushIds: [pushId],
      } = await queueGiftPush(ana.id);
      sendPushMock.mockRejectedValue(webPushError(403));

      expect(await deliveries.attemptNotificationDelivery(pushId!)).toEqual({
        processed: true,
        status: "failed",
      });

      expect(await deliveryById(pushId!)).toMatchObject({
        status: "failed",
        attempts: 1,
        lastError: "push_403",
        pushSubscriptionId: device.id,
      });
      expect(await deviceById(device.id)).not.toBeNull();
      expect(consoleError.mock.calls).toEqual([
        ["Push rejected", { error: "push_403", host: "fcm.googleapis.com" }],
      ]);
      consoleError.mockClear();
    });

    it("refuses to send to a stored endpoint outside the push services, and removes it", async () => {
      const ana = await createUser();
      // Rows no subscribe would write: a third-party host, and one the two
      // URL parsers read differently.
      const evil = await addDevice(ana.id, {
        endpoint: `https://evil.test/${randomUUID()}`,
      });
      const split = await addDevice(ana.id, {
        endpoint: `https://127.0.0.1;.fcm.googleapis.com/${randomUUID()}`,
      });
      const { pushIds } = await queueGiftPush(ana.id);
      expect(pushIds).toHaveLength(2);

      const counts = await deliveries.sendNotificationDeliveries(
        pushIds,
        30_000,
      );

      expect(counts).toEqual({ sent: 0, skipped: 0, failed: 2, retry: 0 });
      for (const id of pushIds) {
        expect(await deliveryById(id)).toMatchObject({
          status: "failed",
          attempts: 1,
          lastError: "endpoint_rejected",
          pushSubscriptionId: null,
        });
      }
      expect(await deviceById(evil.id)).toBeNull();
      expect(await deviceById(split.id)).toBeNull();
      expect(sendPushMock).not.toHaveBeenCalled();
    });

    it("sends to the other device when one of a person's devices is gone, and resends to neither", async () => {
      const ana = await createUser();
      const gone = await addDevice(ana.id);
      const working = await addDevice(ana.id);
      const { pushIds } = await queueGiftPush(ana.id);
      sendPushMock.mockImplementation(async (target: { endpoint: string }) => {
        if (target.endpoint === gone.endpoint) throw webPushError(410);
        return SENT;
      });

      expect(
        await deliveries.sendNotificationDeliveries(pushIds, 30_000),
      ).toEqual({ sent: 1, skipped: 1, failed: 0, retry: 0 });
      expect(
        await deliveries.sendNotificationDeliveries(pushIds, 30_000),
      ).toEqual({ sent: 0, skipped: 0, failed: 0, retry: 0 });

      expect(sendPushMock).toHaveBeenCalledTimes(2);
      expect(await deviceById(gone.id)).toBeNull();
      expect(await deviceById(working.id)).not.toBeNull();
    });

    it("claims and sends nothing when the run has no time left", async () => {
      const ana = await createUser();
      await addDevice(ana.id);
      const { pushIds } = await queueGiftPush(ana.id);
      expect(pushIds).toHaveLength(1);

      expect(await deliveries.sendNotificationDeliveries(pushIds, 0)).toEqual({
        sent: 0,
        skipped: 0,
        failed: 0,
        retry: 0,
      });

      expect(await deliveryById(pushIds[0])).toMatchObject({
        status: "pending",
        attempts: 0,
        leaseOwner: null,
      });
      expect(sendPushMock).not.toHaveBeenCalled();
    });
  });

  describe("pushes no longer worth sending", () => {
    async function expectSkipped(deliveryId: number, reason: string) {
      expect(await deliveries.attemptNotificationDelivery(deliveryId)).toEqual({
        processed: true,
        status: "skipped",
      });
      expect(await deliveryById(deliveryId)).toMatchObject({
        status: "skipped",
        lastError: reason,
        attempts: 0,
        sentAt: null,
        leaseOwner: null,
      });
      expect(sendPushMock).not.toHaveBeenCalled();
    }

    it("skips a push whose item was already read in the app", async () => {
      const ana = await createUser();
      await addDevice(ana.id);
      const {
        notificationId,
        pushIds: [pushId],
      } = await queueGiftPush(ana.id);
      await integrationDb!
        .update(notifications)
        .set({ readAt: new Date() })
        .where(eq(notifications.id, notificationId));

      await expectSkipped(pushId!, "read");
    });

    it("skips a push whose item was archived", async () => {
      const ana = await createUser();
      await addDevice(ana.id);
      const {
        notificationId,
        pushIds: [pushId],
      } = await queueGiftPush(ana.id);
      await integrationDb!
        .update(notifications)
        .set({ archivedAt: new Date() })
        .where(eq(notifications.id, notificationId));

      await expectSkipped(pushId!, "archived");
    });

    it("skips a push whose device was removed", async () => {
      const ana = await createUser();
      const device = await addDevice(ana.id);
      const {
        pushIds: [pushId],
      } = await queueGiftPush(ana.id);
      await integrationDb!
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.id, device.id));
      expect((await deliveryById(pushId!)).pushSubscriptionId).toBeNull();

      await expectSkipped(pushId!, "no_device");
    });

    it("skips a push whose device now belongs to someone else", async () => {
      const ana = await createUser();
      const bruno = await createUser();
      const device = await addDevice(ana.id);
      const {
        pushIds: [pushId],
      } = await queueGiftPush(ana.id);
      await integrationDb!
        .update(pushSubscriptions)
        .set({ userId: bruno.id })
        .where(eq(pushSubscriptions.id, device.id));

      await expectSkipped(pushId!, "no_device");
    });

    it("skips a push older than a push service would keep it", async () => {
      const ana = await createUser();
      await addDevice(ana.id);
      const {
        pushIds: [pushId],
      } = await queueGiftPush(ana.id);
      await integrationDb!
        .update(notificationDeliveries)
        .set({ createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000) })
        .where(eq(notificationDeliveries.id, pushId!));

      await expectSkipped(pushId!, "expired");
    });

    it("skips a push to someone whose profile is being deleted", async () => {
      const ana = await createUser();
      await addDevice(ana.id);
      const {
        pushIds: [pushId],
      } = await queueGiftPush(ana.id);
      await integrationDb!
        .insert(pendingUserDeletions)
        .values({ userId: ana.id, clerkId: ana.clerkId });

      await expectSkipped(pushId!, "deleting");
    });

    it("skips an Administración push to someone who is no longer an admin", async () => {
      const admin = await createUser("admin");
      await addDevice(admin.id);
      const {
        deliveryIds: [pushId],
      } = await notifyNow({
        userId: admin.id,
        kind: "reservation_proof_submitted_admin",
        data: adminReservationData(),
      });
      await integrationDb!
        .update(users)
        .set({ role: "user" })
        .where(eq(users.id, admin.id));

      await expectSkipped(pushId!, "not_visible");
    });

    it("sends an Administración push to someone who still is an admin", async () => {
      const admin = await createUser("admin");
      await addDevice(admin.id);
      const {
        deliveryIds: [pushId],
      } = await notifyNow({
        userId: admin.id,
        kind: "reservation_proof_submitted_admin",
        data: adminReservationData(),
      });

      expect(await deliveries.attemptNotificationDelivery(pushId!)).toEqual({
        processed: true,
        status: "sent",
      });
    });
  });

  describe("pushes handed back for a server that can send them", () => {
    it("leaves a push untried for an hour on a server without VAPID keys", async () => {
      const ana = await createUser();
      await addDevice(ana.id);
      const {
        pushIds: [pushId],
      } = await queueGiftPush(ana.id);
      vapid.current = null;

      const before = Date.now();
      expect(await deliveries.attemptNotificationDelivery(pushId!)).toEqual({
        processed: true,
        status: "retry",
      });

      const row = await deliveryById(pushId!);
      expect(row).toMatchObject({
        status: "pending",
        attempts: 0,
        lastError: "unconfigured",
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      expectAbout(row.nextAttemptAt, before + 60 * 60 * 1000);
      expect(sendPushMock).not.toHaveBeenCalled();

      // Nor does the push drain touch anything on such a server.
      expect(await deliveries.sendDuePushDeliveries()).toEqual({
        scanned: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
        retry: 0,
      });
      expect(await deliveryById(pushId!)).toEqual(row);
    });

    it("leaves a push untried for a server whose keys the device did not subscribe with", async () => {
      const ana = await createUser();
      await addDevice(ana.id, { applicationServerKey: OTHER_VAPID.publicKey });
      const {
        pushIds: [pushId],
      } = await queueGiftPush(ana.id);

      const before = Date.now();
      expect(await deliveries.attemptNotificationDelivery(pushId!)).toEqual({
        processed: true,
        status: "retry",
      });

      const row = await deliveryById(pushId!);
      expect(row).toMatchObject({
        status: "pending",
        attempts: 0,
        lastError: "key_mismatch",
      });
      expectAbout(row.nextAttemptAt, before + 60 * 60 * 1000);
      expect(sendPushMock).not.toHaveBeenCalled();
    });
  });

  describe("gift pushes", () => {
    async function grantedGift() {
      const admin = await createUser("admin");
      const ana = await createUser();
      // The sender's summary is informational: no push, device or not.
      await addDevice(admin.id);
      await addDevice(ana.id);
      const created = await gifts.createCreditGift(giftInput([ana.id]), {
        id: admin.id,
      });
      if (!created.ok) throw new Error("gift not created");
      const processed = await gifts.processCreditGift(created.campaignId);
      const rows = await deliveriesOfUser(ana.id);
      const email = rows.find((row) => row.channel === "email")!;
      const push = rows.find((row) => row.channel === "push")!;
      return {
        admin,
        ana,
        campaignId: created.campaignId,
        processed,
        email,
        push,
      };
    }

    it("queues a push next to the gift email, for the drain to send right after", async () => {
      const { admin, processed, email, push } = await grantedGift();

      expect(processed.deliveryIds).toEqual([email.id, push.id]);
      expect(push).toMatchObject({
        templateKey: "credit_gift_received",
        notificationId: email.notificationId,
        status: "pending",
      });
      const adminRows = await deliveriesOfUser(admin.id);
      expect(adminRows.filter((row) => row.channel === "push")).toEqual([]);
    });

    it("cancels a gift's queued push when the gift is revoked", async () => {
      const { admin, ana, campaignId, push } = await grantedGift();

      await gifts.revokeCreditGift({
        campaignId,
        userIds: [ana.id],
        actorId: admin.id,
      });

      expect(await deliveryById(push.id)).toMatchObject({
        status: "skipped",
        lastError: "revoked",
      });
    });

    it("never sends a gift push whose gift was revoked while it was out", async () => {
      const { admin, ana, campaignId, push } = await grantedGift();
      // The drain had claimed it when the revoke ran, so the revoke left it
      // alone; the attempt then failed and put it back in the queue.
      await integrationDb!
        .update(notificationDeliveries)
        .set({ status: "processing", leaseOwner: "elsewhere" })
        .where(eq(notificationDeliveries.id, push.id));
      await gifts.revokeCreditGift({
        campaignId,
        userIds: [ana.id],
        actorId: admin.id,
      });
      await integrationDb!
        .update(notificationDeliveries)
        .set({ status: "pending", leaseOwner: null })
        .where(eq(notificationDeliveries.id, push.id));

      expect(
        await deliveries.sendNotificationDeliveries([push.id], 30_000),
      ).toEqual({ sent: 0, skipped: 1, failed: 0, retry: 0 });
      expect(await deliveryById(push.id)).toMatchObject({
        status: "skipped",
        lastError: "revoked",
      });
      expect(sendPushMock).not.toHaveBeenCalled();
    });

    it("reports and re-sends a gift's email whatever its push is doing", async () => {
      const { admin, ana, campaignId, email, push } = await grantedGift();
      currentProfile.value = { id: admin.id, role: "admin" };
      const resend = () =>
        gifts.resendCreditGiftNotification({
          campaignId,
          userId: ana.id,
          actorId: admin.id,
        });
      const recipient = async () => {
        const detail = await giftQueries.fetchCreditGift(campaignId);
        if (!detail) throw new Error("gift detail not visible");
        return { row: detail.recipients[0]!, counts: detail.counts };
      };

      // The email is still queued: a re-send now would arrive twice.
      expect((await recipient()).row.emailState).toBe("pending");
      expect(await resend()).toEqual({ ok: false, code: "EMAIL_PENDING" });

      // The email went out; the push, a newer row, failed.
      await integrationDb!
        .update(notificationDeliveries)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(notificationDeliveries.id, email.id));
      await integrationDb!
        .update(notificationDeliveries)
        .set({ status: "failed", lastError: "push_403" })
        .where(eq(notificationDeliveries.id, push.id));
      const failedPush = await recipient();
      expect(failedPush.row).toMatchObject({
        emailState: "sent",
        resendCount: 0,
      });
      expect(failedPush.counts).toMatchObject({
        emailsSent: 1,
        emailsFailed: 0,
      });

      // A push still on its way is not an email on its way.
      await integrationDb!
        .update(notificationDeliveries)
        .set({ status: "pending", lastError: null })
        .where(eq(notificationDeliveries.id, push.id));
      expect((await recipient()).row.emailState).toBe("sent");
      const resent = await resend();
      if (!resent.ok) throw new Error(`resend refused: ${resent.code}`);

      expect(await deliveryById(resent.deliveryId)).toMatchObject({
        channel: "email",
        recipientEmail: ana.email,
        pushSubscriptionId: null,
        resendOfDeliveryId: email.id,
        requestedByUserId: admin.id,
      });
      expect(await recipient()).toMatchObject({
        row: { emailState: "pending", resendCount: 1 },
      });
    });
  });

  describe("draining", () => {
    it("sends a batch of pushes back to back, without the gap emails get", async () => {
      const ana = await createUser();
      await addDevice(ana.id);
      await addDevice(ana.id);
      await addDevice(ana.id);
      const { pushIds } = await queueGiftPush(ana.id);
      expect(pushIds).toHaveLength(3);

      const startedAt = performance.now();
      const counts = await deliveries.sendNotificationDeliveries(
        pushIds,
        30_000,
      );
      const elapsed = performance.now() - startedAt;

      expect(counts).toEqual({ sent: 3, skipped: 0, failed: 0, retry: 0 });
      // Two 600 ms gaps would take 1.2 s on their own.
      expect(elapsed).toBeLessThan(1_200);
    });

    it("right after a commit, sends the pushes it just queued and leaves retries to the cron", async () => {
      const [fresh, retried, old] = await Promise.all([
        createUser(),
        createUser(),
        createUser(),
      ]);
      for (const person of [fresh, retried, old]) await addDevice(person.id);
      const {
        pushIds: [freshId],
      } = await queueGiftPush(fresh.id);
      const {
        pushIds: [retriedId],
      } = await queueGiftPush(retried.id);
      const {
        pushIds: [oldId],
      } = await queueGiftPush(old.id);
      await integrationDb!
        .update(notificationDeliveries)
        .set({ attempts: 1 })
        .where(eq(notificationDeliveries.id, retriedId!));
      await integrationDb!
        .update(notificationDeliveries)
        .set({ createdAt: sql`now() - interval '20 minutes'` })
        .where(eq(notificationDeliveries.id, oldId!));
      // An email due now is not the push drain's either.
      const anaEmail = await notifyNow({
        userId: fresh.id,
        kind: "credit_gift_revoked",
        data: {
          campaignId: 1,
          name: "Ana",
          amount: 5,
          title: "Un regalo",
          debtAmount: 0,
        },
        email: fresh.email,
      });
      const emailId = anaEmail.deliveryIds[0]!;
      expect((await deliveryById(emailId)).channel).toBe("email");

      await deliveries.drainDuePushDeliveries();

      expect((await deliveryById(freshId!)).status).toBe("sent");
      expect((await deliveryById(retriedId!)).status).toBe("pending");
      expect((await deliveryById(oldId!)).status).toBe("pending");
      expect((await deliveryById(emailId)).status).toBe("pending");
      expect(sendEmailMock).not.toHaveBeenCalled();

      // The cron's pass takes them, oldest first.
      await deliveries.sendDuePushDeliveries({
        limit: 1_000,
        budgetMs: 10_000,
      });

      expect((await deliveryById(retriedId!)).status).toBe("sent");
      expect((await deliveryById(oldId!)).status).toBe("sent");
      expect((await deliveryById(emailId)).status).toBe("pending");
    });

    it("still spaces one email from the next", async () => {
      const ana = await createUser();
      const bruno = await createUser();
      const ids: number[] = [];
      for (const person of [ana, bruno]) {
        const result = await notifyNow({
          userId: person.id,
          kind: "credit_gift_received",
          data: giftData(),
          email: person.email,
        });
        ids.push(...result.deliveryIds);
      }
      expect(ids).toHaveLength(2);

      const startedAt = performance.now();
      const counts = await deliveries.sendNotificationDeliveries(ids, 30_000);
      const elapsed = performance.now() - startedAt;

      expect(counts).toEqual({ sent: 2, skipped: 0, failed: 0, retry: 0 });
      expect(sendEmailMock).toHaveBeenCalledTimes(2);
      expect(elapsed).toBeGreaterThanOrEqual(590);
    });
  });

  describe("devices", () => {
    function subscription(
      overrides: { endpoint?: string; label?: string } = {},
    ) {
      return {
        endpoint: fcmEndpoint(),
        ...browserKeys(),
        applicationServerKey: VAPID.publicKey,
        label: "Chrome en Windows",
        ...overrides,
      };
    }

    it("saves a device, and saving the same browser again refreshes that row", async () => {
      const ana = await createUser();
      const first = subscription();

      const id = await devices.savePushSubscription({
        userId: ana.id,
        ...first,
      });
      expect(typeof id).toBe("number");
      await integrationDb!
        .update(pushSubscriptions)
        .set({ lastUsedAt: new Date(Date.now() - 2 * 86_400_000) })
        .where(eq(pushSubscriptions.id, id as number));

      const rotated = {
        ...first,
        ...browserKeys(),
        label: "Chrome en Android",
      };
      expect(
        await devices.savePushSubscription({ userId: ana.id, ...rotated }),
      ).toBe(id);

      const rows = await devicesOf(ana.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id,
        endpoint: first.endpoint,
        p256dh: rotated.p256dh,
        auth: rotated.auth,
        deviceLabel: "Chrome en Android",
      });
      expectAbout(rows[0]!.lastUsedAt, Date.now());

      // The device list never carries the endpoint or keys.
      const listed = await devices.fetchPushDevices(ana.id);
      expect(listed).toEqual([
        {
          id,
          label: "Chrome en Android",
          createdAt: rows[0]!.createdAt,
          lastUsedAt: rows[0]!.lastUsedAt,
        },
      ]);
    });

    it("moves a browser to whoever signs in on it, given the same keys", async () => {
      const ana = await createUser();
      const bruno = await createUser();
      const shared = subscription();
      const id = await devices.savePushSubscription({
        userId: ana.id,
        ...shared,
      });

      expect(
        await devices.savePushSubscription({ userId: bruno.id, ...shared }),
      ).toBe(id);

      expect(await devicesOf(ana.id)).toEqual([]);
      expect(await devicesOf(bruno.id)).toMatchObject([
        { id, endpoint: shared.endpoint },
      ]);
    });

    it("leaves a device with its owner when someone else presents its endpoint without its keys", async () => {
      const ana = await createUser();
      const bruno = await createUser();
      const owned = subscription();
      const id = await devices.savePushSubscription({
        userId: ana.id,
        ...owned,
      });

      expect(
        await devices.savePushSubscription({
          userId: bruno.id,
          ...owned,
          ...browserKeys(),
        }),
      ).toBeNull();

      expect(await devicesOf(bruno.id)).toEqual([]);
      expect(await devicesOf(ana.id)).toMatchObject([
        { id, p256dh: owned.p256dh, auth: owned.auth },
      ]);
    });

    it("keeps the ten most recently used devices of a person", async () => {
      const ana = await createUser();
      const bruno = await createUser();
      const brunoDevice = await addDevice(bruno.id);
      const ids: number[] = [];
      for (let n = 0; n < 10; n += 1) {
        ids.push(
          (await devices.savePushSubscription({
            userId: ana.id,
            ...subscription(),
          })) as number,
        );
      }
      // The oldest by use, not by creation: the fourth one saved.
      const leastUsed = ids[3]!;
      await integrationDb!
        .update(pushSubscriptions)
        .set({ lastUsedAt: new Date(Date.now() - 60 * 60 * 1000) })
        .where(inArray(pushSubscriptions.id, ids));
      await integrationDb!
        .update(pushSubscriptions)
        .set({ lastUsedAt: new Date(Date.now() - 3 * 86_400_000) })
        .where(eq(pushSubscriptions.id, leastUsed));

      const newest = await devices.savePushSubscription({
        userId: ana.id,
        ...subscription(),
      });

      const kept = (await devicesOf(ana.id)).map((row) => row.id);
      expect(kept).toHaveLength(devices.MAX_PUSH_DEVICES_PER_USER);
      expect(kept).not.toContain(leastUsed);
      expect(kept).toContain(ids[0]);
      expect(kept).toContain(newest);
      expect(await deviceById(brunoDevice.id)).not.toBeNull();
    });

    it("saves nothing for someone whose profile is being deleted", async () => {
      const ana = await createUser();
      await integrationDb!
        .insert(pendingUserDeletions)
        .values({ userId: ana.id, clerkId: ana.clerkId });

      expect(
        await devices.savePushSubscription({
          userId: ana.id,
          ...subscription(),
        }),
      ).toBe("deleting");
      expect(await devicesOf(ana.id)).toEqual([]);
    });

    it("refreshes only the person's own row, and never creates one", async () => {
      const ana = await createUser();
      const bruno = await createUser();
      const mine = await addDevice(ana.id, {
        lastUsedAt: new Date(Date.now() - 2 * 86_400_000),
      });
      const theirs = await addDevice(bruno.id);
      const keys = browserKeys();
      const refresh = (userId: number, endpoint: string) =>
        devices.refreshPushSubscription({
          userId,
          endpoint,
          ...keys,
          applicationServerKey: VAPID.publicKey,
          label: "iPhone",
        });

      expect(await refresh(ana.id, mine.endpoint)).toBe(mine.id);
      const refreshed = await deviceById(mine.id);
      expect(refreshed).toMatchObject({ ...keys, deviceLabel: "iPhone" });
      expectAbout(refreshed!.lastUsedAt, Date.now());

      expect(await refresh(ana.id, theirs.endpoint)).toBeNull();
      expect(await deviceById(theirs.id)).toEqual(theirs);

      const missing = fcmEndpoint();
      expect(await refresh(ana.id, missing)).toBeNull();
      expect(await devicesOf(ana.id)).toHaveLength(1);
    });

    it("lets go of someone else's row for this browser only with that row's keys", async () => {
      const ana = await createUser();
      const bruno = await createUser();
      const theirs = await addDevice(bruno.id);
      const mine = await addDevice(ana.id);

      expect(
        await devices.releaseForeignPushSubscription({
          userId: ana.id,
          endpoint: theirs.endpoint,
          auth: browserKeys().auth,
        }),
      ).toBe(false);
      expect(
        await devices.releaseForeignPushSubscription({
          userId: ana.id,
          endpoint: mine.endpoint,
          auth: mine.auth,
        }),
      ).toBe(false);
      expect(await deviceById(theirs.id)).not.toBeNull();
      expect(await deviceById(mine.id)).not.toBeNull();

      expect(
        await devices.releaseForeignPushSubscription({
          userId: ana.id,
          endpoint: theirs.endpoint,
          auth: theirs.auth,
        }),
      ).toBe(true);
      expect(await deviceById(theirs.id)).toBeNull();
    });

    it("removes only the person's own devices, by id or by endpoint", async () => {
      const ana = await createUser();
      const bruno = await createUser();
      const [first, second] = [
        await addDevice(ana.id),
        await addDevice(ana.id),
      ];
      const theirs = await addDevice(bruno.id);

      expect(
        await devices.removePushSubscriptions(ana.id, {
          ids: [first.id, theirs.id],
        }),
      ).toBe(1);
      expect(
        await devices.removePushSubscriptions(ana.id, {
          endpoint: theirs.endpoint,
        }),
      ).toBe(0);
      expect(
        await devices.removePushSubscriptions(ana.id, {
          endpoint: second.endpoint,
        }),
      ).toBe(1);

      expect(await devicesOf(ana.id)).toEqual([]);
      expect(await deviceById(theirs.id)).not.toBeNull();
    });

    it("forgets every device of a profile being deleted, and nobody else's", async () => {
      const ana = await createUser();
      const bruno = await createUser();
      await addDevice(ana.id);
      await addDevice(ana.id);
      const theirs = await addDevice(bruno.id);

      await integrationDb!.transaction((tx) =>
        devices.forgetPushDevices(tx, ana.id),
      );

      expect(await devicesOf(ana.id)).toEqual([]);
      expect(await deviceById(theirs.id)).not.toBeNull();
    });

    it("never writes a device's endpoint or keys to the query log", async () => {
      const ana = await createUser();
      const bruno = await createUser();
      const browser = subscription();
      consoleLog.mockClear();

      const id = (await devices.savePushSubscription({
        userId: ana.id,
        ...browser,
      })) as number;
      await devices.refreshPushSubscription({ userId: ana.id, ...browser });
      await devices.releaseForeignPushSubscription({
        userId: bruno.id,
        endpoint: browser.endpoint,
        auth: browser.auth,
      });
      const again = await devices.savePushSubscription({
        userId: ana.id,
        ...browser,
      });
      const {
        pushIds: [pushId],
      } = await queueGiftPush(ana.id);
      sendPushMock.mockRejectedValue(webPushError(410));
      await deliveries.attemptNotificationDelivery(pushId!);

      expect(again).not.toBe(id);
      const logged = JSON.stringify(consoleLog.mock.calls);
      expect(logged).toContain("push_subscriptions");
      expect(logged).toContain("[REDACTED_PUSH]");
      for (const secret of [browser.endpoint, browser.p256dh, browser.auth]) {
        expect(logged).not.toContain(secret);
      }
    });
  });

  describe("a device removed while a push is being written", () => {
    it("skips a device removed mid-write and still commits the inbox item", async () => {
      const ana = await createUser();
      const removed = await addDevice(ana.id);
      const kept = await addDevice(ana.id);
      const remover = await pool!.connect();
      try {
        // The removal is under way, not committed, when notify() reaches it.
        await remover.query("BEGIN");
        await remover.query("DELETE FROM push_subscriptions WHERE id = $1", [
          removed.id,
        ]);
        const removerPid = await backendPid(remover);
        const writing = integrationDb!
          .transaction((tx) =>
            notifyModule.notify(tx, {
              userId: ana.id,
              kind: "credit_gift_received",
              data: giftData(),
              dedupeKey: `push-it:${randomUUID()}`,
            }),
          )
          .then(
            (value) => ({ value, error: null }),
            (error: unknown) => ({ value: null, error }),
          );

        await waitUntilBlockedBy(removerPid);
        await remover.query("COMMIT");
        const { value, error } = await writing;

        expect(error).toBeNull();
        const rows = await deliveriesOfItem(value!.notificationId);
        expect(rows.map((row) => row.pushSubscriptionId)).toEqual([kept.id]);
        expect(value!.deliveryIds).toEqual([rows[0]!.id]);
      } finally {
        await remover.query("ROLLBACK").catch(() => undefined);
        remover.release();
      }
    });

    it("makes a removal wait for the item being written, then keeps its push as history", async () => {
      const ana = await createUser();
      const device = await addDevice(ana.id);
      let release!: () => void;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let reportPid!: (pid: number) => void;
      const writerPid = new Promise<number>((resolve) => {
        reportPid = resolve;
      });

      const writing = integrationDb!.transaction(async (tx) => {
        const result = await notifyModule.notify(tx, {
          userId: ana.id,
          kind: "credit_gift_received",
          data: giftData(),
          dedupeKey: `push-it:${randomUUID()}`,
        });
        const { rows } = await tx.execute<{ pid: number }>(
          sql`SELECT pg_backend_pid() AS pid`,
        );
        reportPid(Number(rows[0]!.pid));
        await released;
        return result;
      });
      // A write that fails before reporting its backend rejects here.
      const pid = await Promise.race([
        writerPid,
        writing.then(() => writerPid),
      ]);

      const removing = pool!.query(
        "DELETE FROM push_subscriptions WHERE id = $1",
        [device.id],
      );
      try {
        await waitUntilBlockedBy(pid);
      } finally {
        release();
      }
      const result = await writing;
      expect((await removing).rowCount).toBe(1);

      const [push] = await deliveriesOfItem(result.notificationId);
      expect(push).toMatchObject({
        id: result.deliveryIds[0],
        channel: "push",
        pushSubscriptionId: null,
        status: "pending",
      });
      expect(await deliveries.attemptNotificationDelivery(push!.id)).toEqual({
        processed: true,
        status: "skipped",
      });
      expect((await deliveryById(push!.id)).lastError).toBe("no_device");
    });
  });

  describe("the flags, read when the push is sent", () => {
    /**
     * `send.ts` keeps the two flag rules for 30 seconds in module scope, so
     * each test gets a worker loaded fresh under the rules it sets.
     */
    async function workerWith(rules: Partial<PushFlags>) {
      flags.rules = {
        notifications: PUBLIC,
        push_notifications: PUBLIC,
        ...rules,
      };
      vi.resetModules();
      return import("@/app/lib/notifications/deliveries");
    }

    it("stops avisos to a participant while push is for admins only, and still sends an admin's", async () => {
      const ana = await createUser();
      const admin = await createUser("admin");
      await addDevice(ana.id);
      await addDevice(admin.id);
      const {
        pushIds: [anaPush],
      } = await queueGiftPush(ana.id);
      const {
        pushIds: [adminPush],
      } = await queueGiftPush(admin.id);
      const worker = await workerWith({
        push_notifications: { visibility: "admin_only", targetedUserIds: [] },
      });

      expect(await worker.attemptNotificationDelivery(anaPush!)).toEqual({
        processed: true,
        status: "skipped",
      });
      expect(await deliveryById(anaPush!)).toMatchObject({
        status: "skipped",
        lastError: "push_off",
      });
      expect(await worker.attemptNotificationDelivery(adminPush!)).toEqual({
        processed: true,
        status: "sent",
      });
      expect(sendPushMock).toHaveBeenCalledTimes(1);
    });

    it("sends to a participant the push flag targets before launch", async () => {
      const ana = await createUser();
      await addDevice(ana.id);
      const {
        pushIds: [pushId],
      } = await queueGiftPush(ana.id);
      const worker = await workerWith({
        push_notifications: {
          visibility: "admin_only",
          targetedUserIds: [ana.id],
        },
      });

      expect(await worker.attemptNotificationDelivery(pushId!)).toEqual({
        processed: true,
        status: "sent",
      });
    });

    it("stops every aviso while the inbox itself is hidden, even an admin's", async () => {
      const admin = await createUser("admin");
      await addDevice(admin.id);
      const {
        pushIds: [pushId],
      } = await queueGiftPush(admin.id);
      const worker = await workerWith({
        notifications: { visibility: "hidden", targetedUserIds: [] },
      });

      expect(await worker.attemptNotificationDelivery(pushId!)).toEqual({
        processed: true,
        status: "skipped",
      });
      expect(await deliveryById(pushId!)).toMatchObject({
        lastError: "push_off",
      });
      expect(sendPushMock).not.toHaveBeenCalled();
    });
  });
});
