// @vitest-environment node

import { createECDH, randomBytes, randomUUID } from "crypto";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as schema from "@/db/schema";
import {
  disciplinaryNotificationJobs,
  notificationDeliveries,
  pushSubscriptions,
  reservationNotificationJobs,
  users,
} from "@/db/schema";

/**
 * The failure summary of the admin notification log against a real
 * database: who may read it, what counts as a failure in the last 24 hours,
 * and when many failures with the same error are flagged.
 *
 * Every row here is dated in a year of its own and the summary is read "as
 * of" that year, so rows other suites write today never fall in its window.
 */

const requireAdmin = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/helpers", () => ({ requireAdmin }));

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

type Failures = typeof import("@/app/lib/notifications/admin-log-failures");
let failures: Failures;

const MARK = randomUUID().replace(/-/g, "").slice(0, 10);
const createdUserIds: number[] = [];
let person: { id: number; email: string };

/** A wall-clock time in a year nothing else writes to. */
function at(year: number, minutes: number) {
  return new Date(Date.UTC(year, 2, 1, 12, 0) + minutes * 60_000);
}

async function devices(count: number, host = "fcm.googleapis.com/fcm/send") {
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    rows.push({
      userId: person.id,
      endpoint: `https://${host}/fallas-${MARK}-${randomUUID()}`,
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
      applicationServerKey: "test-key",
      deviceLabel: `Teléfono ${index}`,
    });
  }
  return integrationDb!
    .insert(pushSubscriptions)
    .values(rows)
    .returning({ id: pushSubscriptions.id });
}

type DeliveryInsert = typeof notificationDeliveries.$inferInsert;

async function deliveries(rows: Partial<DeliveryInsert>[]) {
  await integrationDb!.insert(notificationDeliveries).values(
    rows.map(
      (row): DeliveryInsert => ({
        userId: person.id,
        templateKey: "credit_gift_received",
        channel: "email",
        recipientEmail: row.channel === "push" ? null : person.email,
        idempotencyKey: `fallas-${MARK}-${randomUUID()}`,
        // As the worker leaves them: never before the row was written.
        nextAttemptAt: row.createdAt,
        ...row,
      }),
    ),
  );
}

function pushFailures(
  ids: { id: number }[],
  year: number,
  error = "push_403",
): Partial<DeliveryInsert>[] {
  return ids.map((device, index) => ({
    channel: "push",
    pushSubscriptionId: device.id,
    status: "failed",
    lastError: error,
    attempts: 1,
    createdAt: at(year, index * 3),
  }));
}

describeDatabase("admin notification log failure summary", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    failures = await import("@/app/lib/notifications/admin-log-failures");

    const [row] = await integrationDb!
      .insert(users)
      .values({
        clerkId: `fallas-${MARK}`,
        email: `fallas-${MARK}@example.test`,
        displayName: `Fallas ${MARK}`,
        role: "user",
        status: "verified",
      })
      .returning({ id: users.id, email: users.email });
    person = row!;
    createdUserIds.push(person.id);
  });

  beforeEach(() => {
    requireAdmin.mockResolvedValue({ id: 1, role: "admin" });
  });

  afterAll(async () => {
    if (!integrationDb) return;
    await integrationDb
      .delete(notificationDeliveries)
      .where(inArray(notificationDeliveries.userId, createdUserIds));
    await integrationDb
      .delete(reservationNotificationJobs)
      .where(inArray(reservationNotificationJobs.userId, createdUserIds));
    await integrationDb
      .delete(disciplinaryNotificationJobs)
      .where(inArray(disciplinaryNotificationJobs.userId, createdUserIds));
    await integrationDb
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, createdUserIds));
    await integrationDb.delete(users).where(inArray(users.id, createdUserIds));
    await pool?.end();
  });

  it("refuses anyone but an admin", async () => {
    requireAdmin.mockResolvedValue(null);
    expect(await failures.fetchNotificationFailureSummary(at(2001, 0))).toBe(
      null,
    );
  });

  it("counts the last 24 hours' failures by channel, leaving skips and retries out", async () => {
    const year = 2001;
    const now = at(year, 60);
    const [device] = await devices(1);
    await deliveries([
      // Counted: two failed emails and a failed push.
      { status: "failed", lastError: "resend:application_error", createdAt: at(year, 0) },
      { status: "failed", lastError: "render_unavailable", createdAt: at(year, -600) },
      {
        channel: "push",
        pushSubscriptionId: device!.id,
        status: "failed",
        lastError: "push_400",
        createdAt: at(year, 10),
      },
      // Not failures.
      { status: "skipped", lastError: "suppressed", createdAt: at(year, 1) },
      {
        channel: "push",
        pushSubscriptionId: null,
        status: "skipped",
        lastError: "no_device",
        createdAt: at(year, 2),
      },
      { status: "pending", lastError: "resend:rate_limit_exceeded", createdAt: at(year, 3) },
      { status: "sent", createdAt: at(year, 4) },
      // Outside the window: older than 24 hours, and after `now`.
      { status: "failed", lastError: "old", createdAt: at(year, -60 * 25) },
      { status: "failed", lastError: "future", createdAt: at(year, 120) },
    ]);
    await integrationDb!.insert(reservationNotificationJobs).values({
      deduplicationKey: `fallas-${MARK}-r`,
      userId: person.id,
      notificationKind: "reservation_confirmed",
      recipientEmail: person.email,
      payload: {},
      status: "failed",
      lastError: "resend:validation_error",
      nextAttemptAt: at(year, 5),
      createdAt: at(year, 5),
    });
    await integrationDb!.insert(disciplinaryNotificationJobs).values([
      {
        deduplicationKey: `fallas-${MARK}-d1`,
        userId: person.id,
        entityType: "infraction",
        entityId: 1,
        notificationKind: "registered",
        recipientEmail: person.email,
        payload: {},
        status: "failed",
        lastError: "resend:application_error",
        nextAttemptAt: at(year, 6),
        createdAt: at(year, 6),
      },
      // A person who deleted their profile: closed as failed, but routine.
      {
        deduplicationKey: `fallas-${MARK}-d2`,
        userId: person.id,
        entityType: "infraction",
        entityId: 2,
        notificationKind: "registered",
        recipientEmail: person.email,
        payload: {},
        status: "failed",
        lastError: "profile_deleted",
        nextAttemptAt: at(year, 7),
        createdAt: at(year, 7),
      },
    ]);

    const summary = await failures.fetchNotificationFailureSummary(now);
    expect(summary).toMatchObject({
      since: new Date(now.getTime() - 24 * 3_600_000),
      until: now,
      counts: { email: 4, push: 1 },
      patterns: [],
    });
  });

  it("flags five devices of one push service failing with the same error", async () => {
    const year = 2002;
    const ids = await devices(5);
    await deliveries(pushFailures(ids, year));

    const summary = await failures.fetchNotificationFailureSummary(
      at(year, 60),
    );
    expect(summary?.counts.push).toBe(5);
    expect(summary?.patterns).toEqual([
      {
        channel: "push",
        error: "push_403",
        platform: "fcm",
        recipients: 5,
        failures: 5,
        from: at(year, 0),
        to: at(year, 12),
      },
    ]);
  });

  it("stays quiet at four devices", async () => {
    const year = 2003;
    await deliveries(pushFailures(await devices(4), year));

    const summary = await failures.fetchNotificationFailureSummary(
      at(year, 60),
    );
    expect(summary?.counts.push).toBe(4);
    expect(summary?.patterns).toEqual([]);
  });

  it("stays quiet for one device failing again and again", async () => {
    const year = 2004;
    const [device] = await devices(1);
    await deliveries(
      Array.from({ length: 8 }, (_, index) => ({
        channel: "push" as const,
        pushSubscriptionId: device!.id,
        status: "failed" as const,
        lastError: "push_403",
        createdAt: at(year, index),
      })),
    );

    const summary = await failures.fetchNotificationFailureSummary(
      at(year, 60),
    );
    expect(summary?.counts.push).toBe(8);
    expect(summary?.patterns).toEqual([]);
  });

  it("keeps push services apart", async () => {
    const year = 2005;
    const fcm = await devices(3);
    const apple = await devices(3, "web.push.apple.com");
    await deliveries([
      ...pushFailures(fcm, year),
      ...pushFailures(apple, year),
    ]);

    const summary = await failures.fetchNotificationFailureSummary(
      at(year, 60),
    );
    expect(summary?.counts.push).toBe(6);
    expect(summary?.patterns).toEqual([]);
  });
});
