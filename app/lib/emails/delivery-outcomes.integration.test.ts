// @vitest-environment node

import { createHmac, randomUUID } from "node:crypto";

import { eq, inArray, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { emailSuppressions, notificationDeliveries } from "@/db/schema";

/**
 * Resend's delivery events on the delivery rows, through the signed webhook
 * against a real database: matching by Resend's id (batch rows too), events
 * out of order and repeated, emails we have no row for, the suppressions
 * left exactly as before, and the admin log showing and filtering it.
 */

const requireAdmin = vi.hoisted(() => vi.fn(async () => true));

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

const WEBHOOK_SECRET =
  "whsec_" + Buffer.from("glitter delivery outcome secret").toString("base64");
const MARK = `entrega${randomUUID().replace(/-/g, "").slice(0, 10)}`;

let webhook: typeof import("@/app/api/webhooks/resend/route");
let log: typeof import("@/app/lib/notifications/admin-log-queries");

function signed(event: unknown) {
  const payload = JSON.stringify(event);
  const id = `msg_${randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
    body: payload,
  });
}

/** A fixed point plus `minutes`, so each test picks the order of events. */
function at(minutes: number) {
  return new Date(Date.UTC(2026, 10, 10, 12, minutes)).toISOString();
}

function event(
  type: string,
  emailId: string,
  minutes: number,
  extra: Record<string, unknown> = {},
) {
  return {
    type,
    created_at: at(minutes),
    data: {
      created_at: at(minutes),
      email_id: emailId,
      from: "Glitter <hola@productoraglitter.com>",
      to: [`${emailId}@example.test`],
      subject: "Hola",
      ...extra,
    },
  };
}

async function post(body: unknown) {
  const response = await webhook.POST(signed(body));
  expect(response.status).toBe(200);
}

async function insertRow(
  emailId: string,
  lane: "transactional" | "bulk" = "transactional",
) {
  const [row] = await integrationDb!
    .insert(notificationDeliveries)
    .values({
      templateKey: "order_received",
      lane,
      recipientEmail: `${emailId}@example.test`,
      status: "sent",
      sentAt: new Date(),
      providerMessageId: emailId,
      idempotencyKey: `direct:${emailId}`,
    })
    .returning({ id: notificationDeliveries.id });
  return row!.id;
}

async function rowFor(emailId: string) {
  const [row] = await integrationDb!
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.providerMessageId, emailId));
  return row!;
}

function emailId(name: string) {
  return `re_${MARK}_${name}`;
}

describeDatabase("Resend delivery outcomes", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;

    webhook = await import("@/app/api/webhooks/resend/route");
    log = await import("@/app/lib/notifications/admin-log-queries");
  });

  afterAll(async () => {
    if (!integrationDb) return;
    await integrationDb
      .delete(notificationDeliveries)
      .where(like(notificationDeliveries.providerMessageId, `re_${MARK}%`));
    await integrationDb
      .delete(emailSuppressions)
      .where(like(emailSuppressions.emailKey, `re_${MARK.toLowerCase()}%`));
    await pool!.end();
  });

  it("records delivered with Resend's time, and leaves our status alone", async () => {
    const id = emailId("ok");
    await insertRow(id);
    await post(event("email.delivered", id, 5));

    expect(await rowFor(id)).toMatchObject({
      status: "sent",
      deliveryOutcome: "delivered",
      deliveryOutcomeAt: new Date(at(5)),
      bounceType: null,
    });
  });

  it("keeps the stronger outcome whatever order events arrive in", async () => {
    const id = emailId("order");
    await insertRow(id);
    await post(
      event("email.bounced", id, 10, {
        bounce: {
          type: "Permanent",
          subType: "General",
          message: "Mailbox does not exist",
        },
      }),
    );
    // Earlier, weaker events arriving late change nothing.
    await post(event("email.delivered", id, 8));
    await post(event("email.delivery_delayed", id, 7));

    expect(await rowFor(id)).toMatchObject({
      deliveryOutcome: "bounced",
      bounceType: "Permanent",
      deliveryDetail: "General: Mailbox does not exist",
      deliveryOutcomeAt: new Date(at(10)),
    });

    // A complaint outranks a bounce, even one reported earlier.
    await post(event("email.complained", id, 9));
    expect(await rowFor(id)).toMatchObject({ deliveryOutcome: "complained" });
  });

  it("moves a delay on to delivered, and ignores repeats", async () => {
    const id = emailId("delay");
    await insertRow(id);
    await post(event("email.delivery_delayed", id, 1));
    await post(event("email.delivery_delayed", id, 1));
    expect((await rowFor(id)).deliveryOutcome).toBe("delivery_delayed");

    await post(event("email.delivered", id, 30));
    await post(event("email.delivered", id, 30));
    const row = await rowFor(id);
    expect(row).toMatchObject({
      deliveryOutcome: "delivered",
      deliveryOutcomeAt: new Date(at(30)),
    });
  });

  it("records a transient bounce, failed and suppressed with their reason", async () => {
    const transient = emailId("transient");
    const failed = emailId("failed");
    const suppressed = emailId("suppressed");
    await Promise.all([
      insertRow(transient),
      insertRow(failed),
      insertRow(suppressed),
    ]);

    await post(
      event("email.bounced", transient, 2, {
        bounce: { type: "Transient", subType: "MailboxFull", message: "" },
      }),
    );
    await post(
      event("email.failed", failed, 2, {
        failed: { reason: "reached_daily_quota" },
      }),
    );
    await post(
      event("email.suppressed", suppressed, 2, {
        suppressed: { type: "OnAccountSuppressionList", message: "Bloqueado" },
      }),
    );

    expect(await rowFor(transient)).toMatchObject({
      deliveryOutcome: "bounced",
      bounceType: "Transient",
      deliveryDetail: "MailboxFull",
    });
    expect(await rowFor(failed)).toMatchObject({
      deliveryOutcome: "failed",
      deliveryDetail: "reached_daily_quota",
    });
    expect(await rowFor(suppressed)).toMatchObject({
      deliveryOutcome: "suppressed",
      deliveryDetail: "OnAccountSuppressionList: Bloqueado",
    });
  });

  it("matches each row of a batch by its own id", async () => {
    const a = emailId("batch_a");
    const b = emailId("batch_b");
    await insertRow(a, "bulk");
    await insertRow(b, "bulk");
    await post(event("email.delivered", a, 3));

    expect((await rowFor(a)).deliveryOutcome).toBe("delivered");
    expect((await rowFor(b)).deliveryOutcome).toBeNull();
  });

  it("keeps the first open and click only", async () => {
    const id = emailId("open");
    await insertRow(id);
    await post(event("email.opened", id, 20));
    await post(event("email.opened", id, 15));
    await post(event("email.opened", id, 25));
    await post(event("email.clicked", id, 22));

    expect(await rowFor(id)).toMatchObject({
      openedAt: new Date(at(15)),
      clickedAt: new Date(at(22)),
      deliveryOutcome: null,
    });
  });

  it("acknowledges events for emails we have no row for, and unknown types", async () => {
    await post(event("email.delivered", emailId("nobody"), 1));
    await post(event("email.sent", emailId("nobody"), 1));
    await post({ type: "contact.created", data: { id: "x" } });
    await post({ type: "email.delivered", data: {} });
  });

  it("still records a permanent bounce as a suppression, as before", async () => {
    const id = emailId("suppress");
    await insertRow(id);
    await post(
      event("email.bounced", id, 4, {
        bounce: { type: "Permanent", subType: "General", message: "Gone" },
      }),
    );

    const [suppression] = await integrationDb!
      .select()
      .from(emailSuppressions)
      .where(inArray(emailSuppressions.emailKey, [`${id}@example.test`]));
    expect(suppression).toMatchObject({
      reason: "bounce",
      resendEmailId: id,
      detail: "General: Gone",
      liftedAt: null,
    });
    expect((await rowFor(id)).deliveryOutcome).toBe("bounced");
  });

  it("shows the outcome on the admin log and filters by it", async () => {
    const base = {
      query: `re_${MARK}`,
      channel: [],
      status: [],
      from: undefined,
      to: undefined,
      limit: 200,
      offset: 0,
    };
    const all = await log.fetchNotificationLogPage({ ...base, outcome: [] });
    const delivered = all!.rows.find(
      (row) => row.recipient.email === `${emailId("ok")}@example.test`,
    );
    expect(delivered!.delivery).toMatchObject({
      outcome: "delivered",
      at: new Date(at(5)),
    });

    const bounced = await log.fetchNotificationLogPage({
      ...base,
      outcome: ["bounced"],
    });
    expect(bounced!.rows.map((row) => row.recipient.email).sort()).toEqual(
      [emailId("suppress"), emailId("transient")]
        .map((id) => `${id}@example.test`)
        .sort(),
    );

    const unknown = await log.fetchNotificationLogPage({
      ...base,
      outcome: ["unknown"],
    });
    expect(unknown!.rows.map((row) => row.recipient.email).sort()).toEqual(
      [emailId("batch_b"), emailId("open")]
        .map((id) => `${id}@example.test`)
        .sort(),
    );
  });
});
