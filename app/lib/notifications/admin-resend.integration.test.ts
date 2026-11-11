// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
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

import type { NotificationLogRow } from "@/app/lib/notifications/admin-log-definitions";
import * as schema from "@/db/schema";
import {
  emailSuppressions,
  notificationDeliveries,
  notifications,
  pendingUserDeletions,
  users,
} from "@/db/schema";

/**
 * "Reenviar correo" on the admin notification log against a real database:
 * which rows can be resent, every refusal, one row for a double submit, the
 * failed row left as it was, and the resend delivered as the same email.
 * Resend is mocked; nothing leaves the machine.
 */

vi.mock("server-only", () => ({}));
const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/vendors/resend", () => ({ sendEmail: sendEmailMock }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 6 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Resend = typeof import("@/app/lib/notifications/admin-resend");
type Notify = typeof import("@/app/lib/notifications/notify");
type Deliveries = typeof import("@/app/lib/notifications/deliveries");
let resend: Resend;
let notifyModule: Notify;
let deliveries: Deliveries;

const createdUserIds: number[] = [];
let admin: { id: number };

async function createUser(role: "user" | "admin" = "user") {
  const suffix = randomUUID();
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `resend-it-${suffix}`,
      email: `resend-it-${suffix}@example.test`,
      displayName: role === "admin" ? `Admin ${suffix}` : `Lola ${suffix}`,
      role,
      status: "verified",
      category: role === "admin" ? "none" : "illustration",
    })
    .returning({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      clerkId: users.clerkId,
    });
  createdUserIds.push(user!.id);
  return user!;
}

/** A gift notice whose email failed for good, as the worker leaves it. */
async function failedEmail(
  overrides: Partial<typeof notificationDeliveries.$inferInsert> = {},
) {
  const person = await createUser();
  const result = await integrationDb!.transaction((tx) =>
    notifyModule.notify(tx, {
      userId: person.id,
      kind: "credit_gift_received",
      data: {
        campaignId: 1,
        name: "Lola",
        amount: 5,
        title: "Un regalo",
        message: "Gracias por el taller.",
      },
      dedupeKey: `resend-it:${randomUUID()}`,
      email: person.email,
    }),
  );
  const [row] = await integrationDb!
    .update(notificationDeliveries)
    .set({
      status: "failed",
      attempts: 5,
      lastError: "resend:application_error",
      ...overrides,
    })
    .where(eq(notificationDeliveries.id, result.deliveryIds[0]!))
    .returning();
  return { person, notificationId: result.notificationId, original: row! };
}

async function resendsOf(id: number) {
  return integrationDb!
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.resendOfDeliveryId, id));
}

function logRow(id: number): NotificationLogRow {
  return {
    key: `delivery:${id}`,
    source: "delivery",
    id,
    channel: "email",
    status: "failed",
    kind: "credit_gift_received",
    title: null,
    reserved: false,
    recipient: { userId: null, name: null, email: null },
    deviceLabel: null,
    deviceRemoved: false,
    lane: "transactional",
    attempts: 5,
    error: null,
    createdAt: new Date(),
    sentAt: null,
    readAt: null,
    retractedAt: null,
    isResend: false,
    links: [],
  };
}

describeDatabase("resending a failed email from the log", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    resend = await import("@/app/lib/notifications/admin-resend");
    notifyModule = await import("@/app/lib/notifications/notify");
    deliveries = await import("@/app/lib/notifications/deliveries");
    admin = await createUser("admin");
  });

  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({
      data: { id: "resend-msg-1" },
      error: null,
    });
  });

  afterAll(async () => {
    if (!integrationDb) return;
    if (createdUserIds.length > 0) {
      await integrationDb
        .delete(pendingUserDeletions)
        .where(inArray(pendingUserDeletions.userId, createdUserIds));
      // Deliveries first: deleting a user both cascades their inbox items and
      // sets null on the deliveries that point at them.
      await integrationDb
        .delete(notificationDeliveries)
        .where(inArray(notificationDeliveries.userId, createdUserIds));
      await integrationDb
        .delete(notifications)
        .where(inArray(notifications.userId, createdUserIds));
      await integrationDb
        .delete(users)
        .where(inArray(users.id, createdUserIds));
    }
    await pool?.end();
  });

  it("writes one linked row from the stored payload and leaves the failed one as it was", async () => {
    const { original } = await failedEmail();

    const outcome = await resend.resendFailedNotificationEmail({
      deliveryId: original.id,
      by: admin.id,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const [after] = await integrationDb!
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.id, original.id));
    expect(after).toEqual(original);

    const [copy] = await resendsOf(original.id);
    expect(copy).toMatchObject({
      id: outcome.deliveryId,
      notificationId: original.notificationId,
      userId: original.userId,
      templateKey: original.templateKey,
      channel: "email",
      lane: "transactional",
      recipientEmail: original.recipientEmail,
      payload: original.payload,
      status: "pending",
      attempts: 0,
      resendOfDeliveryId: original.id,
      requestedByUserId: admin.id,
      idempotencyKey: `notification-delivery:${original.id}:admin-resend`,
    });

    // Delivered as the worker delivers any email: the same message, under
    // the new row's own Resend key.
    await deliveries.attemptNotificationDelivery(outcome.deliveryId);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const [message, options] = sendEmailMock.mock.calls[0]!;
    expect(message).toMatchObject({
      to: [original.recipientEmail],
      subject: "Recibiste 5 créditos de regalo",
    });
    expect(options).toEqual({
      idempotencyKey: `notification-delivery-${outcome.deliveryId}`,
    });
  });

  it("writes one row and sends one email for a double submit", async () => {
    const { original } = await failedEmail();

    const outcomes = await Promise.all([
      resend.resendFailedNotificationEmail({
        deliveryId: original.id,
        by: admin.id,
      }),
      resend.resendFailedNotificationEmail({
        deliveryId: original.id,
        by: admin.id,
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(outcomes.filter((outcome) => !outcome.ok)).toEqual([
      { ok: false, code: "RESEND_PENDING" },
    ]);
    expect(await resendsOf(original.id)).toHaveLength(1);
  });

  it("refuses again once resent, by how the resend went, and lets a failed resend be resent", async () => {
    const { original } = await failedEmail();
    const first = await resend.resendFailedNotificationEmail({
      deliveryId: original.id,
      by: admin.id,
    });
    if (!first.ok) throw new Error("expected a resend");
    const again = () =>
      resend.resendFailedNotificationEmail({
        deliveryId: original.id,
        by: admin.id,
      });

    expect(await again()).toEqual({ ok: false, code: "RESEND_PENDING" });

    await integrationDb!
      .update(notificationDeliveries)
      .set({ status: "sent" })
      .where(eq(notificationDeliveries.id, first.deliveryId));
    expect(await again()).toEqual({ ok: false, code: "RESEND_SENT" });

    await integrationDb!
      .update(notificationDeliveries)
      .set({ status: "failed" })
      .where(eq(notificationDeliveries.id, first.deliveryId));
    expect(await again()).toEqual({ ok: false, code: "RESEND_DONE" });

    // The resend that failed is a failed row of its own.
    const second = await resend.resendFailedNotificationEmail({
      deliveryId: first.deliveryId,
      by: admin.id,
    });
    expect(second.ok).toBe(true);
    expect(await resendsOf(first.deliveryId)).toHaveLength(1);
  });

  it.each([
    ["a bulk email", { lane: "bulk" as const, templateKey: "comunicado" }],
    ["an email Resend accepted", { status: "sent" as const }],
    ["a skipped email", { status: "skipped" as const }],
  ])("refuses %s as not eligible", async (_label, overrides) => {
    const { original } = await failedEmail(overrides);
    expect(
      await resend.resendFailedNotificationEmail({
        deliveryId: original.id,
        by: admin.id,
      }),
    ).toEqual({ ok: false, code: "NOT_ELIGIBLE" });
    expect(await resendsOf(original.id)).toHaveLength(0);
  });

  it("refuses a row that does not exist", async () => {
    expect(
      await resend.resendFailedNotificationEmail({
        deliveryId: 2_147_483_000,
        by: admin.id,
      }),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("refuses a suppressed address, whatever its case", async () => {
    const { original } = await failedEmail();
    await integrationDb!.insert(emailSuppressions).values({
      email: original.recipientEmail!.toUpperCase(),
      emailKey: original.recipientEmail!.trim().toLowerCase(),
      reason: "bounce",
    });
    try {
      expect(
        await resend.resendFailedNotificationEmail({
          deliveryId: original.id,
          by: admin.id,
        }),
      ).toEqual({ ok: false, code: "SUPPRESSED" });
    } finally {
      await integrationDb!
        .delete(emailSuppressions)
        .where(
          eq(
            emailSuppressions.emailKey,
            original.recipientEmail!.trim().toLowerCase(),
          ),
        );
    }
  });

  it("refuses a retracted inbox item", async () => {
    const { original, notificationId } = await failedEmail();
    await integrationDb!
      .update(notifications)
      .set({ retractedAt: new Date(), archivedAt: new Date() })
      .where(eq(notifications.id, notificationId));
    expect(
      await resend.resendFailedNotificationEmail({
        deliveryId: original.id,
        by: admin.id,
      }),
    ).toEqual({ ok: false, code: "RETRACTED" });
  });

  it("refuses an account being deleted", async () => {
    const { original, person } = await failedEmail();
    await integrationDb!
      .insert(pendingUserDeletions)
      .values({ userId: person.id, clerkId: person.clerkId });
    expect(
      await resend.resendFailedNotificationEmail({
        deliveryId: original.id,
        by: admin.id,
      }),
    ).toEqual({ ok: false, code: "DELETING" });
  });

  it("refuses an account that changed its address", async () => {
    const { original, person } = await failedEmail();
    await integrationDb!
      .update(users)
      .set({ email: `nueva-${randomUUID()}@example.test` })
      .where(eq(users.id, person.id));
    expect(
      await resend.resendFailedNotificationEmail({
        deliveryId: original.id,
        by: admin.id,
      }),
    ).toEqual({ ok: false, code: "EMAIL_CHANGED" });
  });

  it("refuses a row whose account is gone", async () => {
    const { original } = await failedEmail();
    // As `ON DELETE SET NULL` leaves it when only the delivery survives.
    await integrationDb!
      .update(notificationDeliveries)
      .set({ userId: null })
      .where(eq(notificationDeliveries.id, original.id));
    expect(
      await resend.resendFailedNotificationEmail({
        deliveryId: original.id,
        by: admin.id,
      }),
    ).toEqual({ ok: false, code: "NO_ACCOUNT" });
  });

  it("refuses a payload that no longer renders", async () => {
    const { original } = await failedEmail({ payload: { amount: "cinco" } });
    expect(
      await resend.resendFailedNotificationEmail({
        deliveryId: original.id,
        by: admin.id,
      }),
    ).toEqual({ ok: false, code: "RENDER_UNAVAILABLE" });
  });

  it("tells the log which rows can be resent, which were and by whom", async () => {
    const resent = await failedEmail();
    const open = await failedEmail();
    const sent = await failedEmail({ status: "sent" });
    const outcome = await resend.resendFailedNotificationEmail({
      deliveryId: resent.original.id,
      by: admin.id,
    });
    if (!outcome.ok) throw new Error("expected a resend");

    const rows = await resend.withNotificationLogResends([
      logRow(resent.original.id),
      logRow(open.original.id),
      { ...logRow(sent.original.id), status: "sent" },
      { ...logRow(outcome.deliveryId), status: "pending", isResend: true },
      { ...logRow(1), key: "reservation_outbox:1", source: "reservation_outbox" },
    ]);
    const byId = new Map(rows.map((row) => [row.key, row]));
    const adminName = { userId: admin.id, name: expect.stringMatching(/^Admin /) };

    expect(byId.get(`delivery:${resent.original.id}`)!.resend).toEqual({
      eligible: false,
      requestedBy: null,
      resentAs: {
        deliveryId: outcome.deliveryId,
        status: "pending",
        at: expect.any(Date),
        by: adminName,
      },
    });
    expect(byId.get(`delivery:${open.original.id}`)!.resend).toEqual({
      eligible: true,
      requestedBy: null,
      resentAs: null,
    });
    expect(byId.get(`delivery:${sent.original.id}`)!.resend?.eligible).toBe(
      false,
    );
    expect(byId.get(`delivery:${outcome.deliveryId}`)!.resend).toEqual({
      eligible: false,
      requestedBy: adminName,
      resentAs: null,
    });
    expect(byId.get("reservation_outbox:1")!.resend).toBeUndefined();
  });
});
