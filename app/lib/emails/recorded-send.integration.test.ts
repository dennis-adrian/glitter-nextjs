// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, like } from "drizzle-orm";
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
import { notificationDeliveries, users } from "@/db/schema";

/**
 * Emails sent outside the queue, recorded in `notification_deliveries`
 * against a real database: the row a send leaves, a caller's retry under the
 * same key, the queue's drains leaving these rows alone, and the admin log
 * listing them with their subject and nothing else of the payload.
 */

const { sendEmailMock, sendBatchEmailsMock, requireAdmin } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  sendBatchEmailsMock: vi.fn(),
  requireAdmin: vi.fn(async () => true),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/app/vendors/resend", () => ({
  sendEmail: sendEmailMock,
  sendBatchEmails: sendBatchEmailsMock,
}));
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

const MARK = `registro${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const SECRET_LINK = `https://example.test/orders/1?token=SECRET-${MARK}`;

let recorded: typeof import("@/app/lib/emails/recorded-send");
let deliveries: typeof import("@/app/lib/notifications/deliveries");
let log: typeof import("@/app/lib/notifications/admin-log-queries");
let userId = 0;

function email(to: string, subject = `Tu orden ${MARK}`) {
  return {
    from: "Glitter Store <reservas@productoraglitter.com>",
    to: [to],
    subject,
    html: `<a href="${SECRET_LINK}">Ver tu orden</a>`,
  };
}

async function rowsFor(address: string) {
  await recorded.settleRecordedEmails();
  return integrationDb!
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.recipientEmail, address));
}

describeDatabase("recorded emails", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    recorded = await import("@/app/lib/emails/recorded-send");
    deliveries = await import("@/app/lib/notifications/deliveries");
    log = await import("@/app/lib/notifications/admin-log-queries");

    const [user] = await integrationDb!
      .insert(users)
      .values({
        clerkId: `recorded-${MARK}`,
        email: `ana-${MARK}@example.test`,
        displayName: `Ana ${MARK}`,
        role: "user",
        status: "verified",
      })
      .returning({ id: users.id });
    userId = user!.id;
  });

  beforeEach(() => {
    sendEmailMock.mockReset();
    sendBatchEmailsMock.mockReset();
  });

  afterAll(async () => {
    if (!integrationDb) return;
    await integrationDb
      .delete(notificationDeliveries)
      .where(like(notificationDeliveries.recipientEmail, `%${MARK}%`));
    await integrationDb.delete(users).where(eq(users.id, userId));
    await pool!.end();
  });

  it("leaves a sent row with Resend's id, and no body", async () => {
    const to = `ana-${MARK}@example.test`;
    sendEmailMock.mockResolvedValue({
      data: { id: `re_${MARK}_1` },
      error: null,
      headers: {},
    });

    await recorded.sendRecordedEmail(email(to), {
      template: "order_received",
      userId,
    });

    const [row] = await rowsFor(to);
    expect(row).toMatchObject({
      templateKey: "order_received",
      userId,
      channel: "email",
      lane: "transactional",
      status: "sent",
      attempts: 1,
      providerMessageId: `re_${MARK}_1`,
      notificationId: null,
    });
    expect(row!.sentAt).toBeInstanceOf(Date);
    expect(row!.idempotencyKey.startsWith("direct:")).toBe(true);
    expect(JSON.stringify(row!.payload)).not.toContain("SECRET");
  });

  it("settles one row across a caller's retries under its key", async () => {
    const to = `reintento-${MARK}@example.test`;
    const key = `order-reminder-${MARK}`;
    sendEmailMock.mockRejectedValueOnce(new Error("Resend request timed out"));
    await expect(
      recorded.sendRecordedEmail(email(to), {
        template: "order_payment_reminder",
        idempotencyKey: key,
      }),
    ).rejects.toThrow("timed out");

    sendEmailMock.mockResolvedValueOnce({
      data: { id: `re_${MARK}_2` },
      error: null,
      headers: {},
    });
    await recorded.sendRecordedEmail(email(to), {
      template: "order_payment_reminder",
      idempotencyKey: key,
    });

    // A late duplicate that Resend refuses does not undo the sent row.
    sendEmailMock.mockResolvedValueOnce({
      data: null,
      error: {
        name: "concurrent_idempotent_requests",
        message: "",
        statusCode: 409,
      },
      headers: {},
    });
    await recorded.sendRecordedEmail(email(to), {
      template: "order_payment_reminder",
      idempotencyKey: key,
    });

    const rows = await rowsFor(to);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "sent",
      attempts: 3,
      lastError: null,
      providerMessageId: `re_${MARK}_2`,
      idempotencyKey: `direct:${key}`,
    });
  });

  it("is never picked up by the queue's drain", async () => {
    const to = `fallo-${MARK}@example.test`;
    sendEmailMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: to, statusCode: 422 },
      headers: {},
    });
    await recorded.sendRecordedEmail(email(to), { template: "ticket_issued" });
    const [row] = await rowsFor(to);
    expect(row).toMatchObject({
      status: "failed",
      lastError: "resend:validation_error",
    });

    sendEmailMock.mockClear();
    await deliveries.sendNotificationDeliveries([row!.id], 5_000);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("records a batch one row per email on the bulk lane", async () => {
    const a = `lote-a-${MARK}@example.test`;
    const b = `lote-b-${MARK}@example.test`;
    sendBatchEmailsMock.mockResolvedValue({
      data: { data: [{ id: `re_${MARK}_a` }, { id: `re_${MARK}_b` }] },
      error: null,
      headers: {},
    });
    await recorded.sendRecordedBatch([email(a), email(b)], {
      template: "festival_participant_invitation_email",
      userIds: [userId, null],
      idempotencyKey: `invite-${MARK}`,
    });

    const [rowA] = await rowsFor(a);
    const [rowB] = await rowsFor(b);
    expect(rowA).toMatchObject({
      lane: "bulk",
      userId,
      providerMessageId: `re_${MARK}_a`,
    });
    expect(rowB).toMatchObject({
      lane: "bulk",
      userId: null,
      providerMessageId: `re_${MARK}_b`,
    });
  });

  it("is listed on the admin log with its label and subject", async () => {
    await recorded.settleRecordedEmails();
    const page = await log.fetchNotificationLogPage({
      query: `ana-${MARK}`,
      channel: ["email"],
      status: [],
      outcome: [],
      from: undefined,
      to: undefined,
      limit: 50,
      offset: 0,
    });
    const row = page!.rows.find((entry) => entry.kind === "order_received");
    expect(row).toMatchObject({
      source: "delivery",
      channel: "email",
      status: "sent",
      title: `Tu orden ${MARK}`,
      recipient: { userId, email: `ana-${MARK}@example.test` },
    });
    expect(JSON.stringify(page)).not.toContain("SECRET");
  });
});
