// @vitest-environment node

import { randomUUID } from "crypto";
import { inArray, sql } from "drizzle-orm";
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

import type {
  NotificationLogRow,
  NotificationLogSearchParams,
} from "@/app/lib/notifications/admin-log-definitions";
import * as schema from "@/db/schema";
import {
  disciplinaryNotificationJobs,
  notificationCampaigns,
  notificationDeliveries,
  notifications,
  pushSubscriptions,
  reservationNotificationJobs,
  users,
  visitors,
} from "@/db/schema";

/**
 * The admin notification log against a real database: who may read it, how
 * the four sources merge, what each filter keeps, and what never reaches the
 * page (push endpoints and keys, email payloads, disciplinary content).
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

type Queries = typeof import("@/app/lib/notifications/admin-log-queries");
let queries: Queries;

// Unique to this run, so other suites' rows in the same database never match.
const MARK = `bitacora${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const PUSH_SECRET = `SECRET-ENDPOINT-${MARK}`;
const PAYLOAD_SECRET = `SECRET-PAYLOAD-${MARK}`;

const ids = {
  admin: 0,
  person: 0,
  other: 0,
  campaign: 0,
  visitor: 0,
  device: 0,
};

function params(
  overrides: Partial<NotificationLogSearchParams> = {},
): NotificationLogSearchParams {
  return {
    query: MARK,
    channel: [],
    status: [],
    from: undefined,
    to: undefined,
    limit: 200,
    offset: 0,
    ...overrides,
  };
}

async function page(overrides: Partial<NotificationLogSearchParams> = {}) {
  const result = await queries.fetchNotificationLogPage(params(overrides));
  if (!result) throw new Error("expected a page");
  return result;
}

function bySource(rows: NotificationLogRow[], source: string) {
  return rows.filter((row) => row.source === source);
}

describeDatabase("admin notification log", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    queries = await import("@/app/lib/notifications/admin-log-queries");

    const db = integrationDb!;
    const [admin, person, other] = await db
      .insert(users)
      .values([
        {
          clerkId: `log-admin-${MARK}`,
          email: `admin-${MARK}@example.test`,
          displayName: "Admin del log",
          role: "admin",
          status: "verified",
        },
        {
          clerkId: `log-person-${MARK}`,
          email: `lola-${MARK}@example.test`,
          displayName: `Lola ${MARK}`,
          role: "user",
          status: "verified",
        },
        {
          clerkId: `log-other-${MARK}`,
          email: `otro-${MARK}@example.test`,
          displayName: `Otro ${MARK}`,
          role: "user",
          status: "verified",
        },
      ])
      .returning({ id: users.id });
    ids.admin = admin!.id;
    ids.person = person!.id;
    ids.other = other!.id;

    const [campaign] = await db
      .insert(notificationCampaigns)
      .values({
        type: "comunicado",
        status: "completed",
        title: "Cambio de horario",
        message: "Hola {nombre}",
        idempotencyKey: `log-${MARK}`,
      })
      .returning({ id: notificationCampaigns.id });
    ids.campaign = campaign!.id;

    const [visitor] = await db
      .insert(visitors)
      .values({
        firstName: "Vera",
        lastName: `Visita ${MARK}`,
        email: `vera-${MARK}@example.test`,
        phoneNumber: "70000000",
        birthdate: new Date("1990-01-01T00:00:00Z"),
      })
      .returning({ id: visitors.id });
    ids.visitor = visitor!.id;

    const [device] = await db
      .insert(pushSubscriptions)
      .values({
        userId: ids.person,
        endpoint: `https://push.example.test/${PUSH_SECRET}`,
        p256dh: `p256dh-${PUSH_SECRET}`,
        auth: `auth-${PUSH_SECRET}`,
        applicationServerKey: "test-key",
        deviceLabel: "iPhone de Lola",
      })
      .returning({ id: pushSubscriptions.id });
    ids.device = device!.id;

    // Spread over three Bolivian days (UTC-4), oldest first.
    const day1 = sql`'2026-03-01 15:00:00'::timestamp`;
    const day2 = sql`'2026-03-02 15:00:00'::timestamp`;
    const day3 = sql`'2026-03-03 15:00:00'::timestamp`;

    const [comunicado] = await db
      .insert(notifications)
      .values([
        {
          userId: ids.person,
          kind: "comunicado",
          category: "announcements",
          title: "Cambio de horario",
          body: "El festival abre a las 10:00.",
          campaignId: ids.campaign,
          dedupeKey: `log:${MARK}:1`,
          readAt: day2,
          createdAt: day2,
        },
        {
          userId: ids.person,
          kind: "infraction_registered",
          category: "account",
          title: `Registramos una infracción ${MARK}`,
          body: "Motivo reservado",
          data: { infractionId: 4242, profileId: ids.person },
          dedupeKey: `log:${MARK}:2`,
          createdAt: day1,
        },
      ])
      .returning({ id: notifications.id });

    await db.insert(notificationDeliveries).values([
      {
        notificationId: comunicado!.id,
        userId: ids.person,
        templateKey: "comunicado",
        channel: "email",
        recipientEmail: `lola-${MARK}@example.test`,
        payload: { secret: PAYLOAD_SECRET },
        status: "sent",
        attempts: 1,
        sentAt: day2,
        idempotencyKey: `log:${MARK}:email`,
        createdAt: day2,
      },
      {
        notificationId: comunicado!.id,
        userId: ids.person,
        templateKey: "comunicado",
        channel: "push",
        pushSubscriptionId: ids.device,
        status: "failed",
        attempts: 3,
        lastError: "push_gone: 410",
        idempotencyKey: `log:${MARK}:push`,
        createdAt: day2,
      },
      {
        // A comunicado to a visitor: no account, no inbox copy.
        templateKey: "comunicado_contact",
        channel: "email",
        lane: "bulk",
        campaignId: ids.campaign,
        recipientEmail: `vera-${MARK}@example.test`,
        status: "skipped",
        lastError: "suppressed",
        idempotencyKey: `log:${MARK}:visitor`,
        createdAt: day3,
      },
      {
        // Someone else's: a search for Lola must not find it.
        userId: ids.other,
        templateKey: "credit_gift_received",
        channel: "email",
        recipientEmail: `otro-${MARK}@example.test`,
        status: "pending",
        idempotencyKey: `log:${MARK}:other`,
        createdAt: day3,
      },
    ]);

    await db.insert(reservationNotificationJobs).values({
      deduplicationKey: `log:${MARK}:reservation`,
      userId: ids.person,
      notificationKind: "settlement_approved",
      recipientEmail: `lola-${MARK}@example.test`,
      payload: { secret: PAYLOAD_SECRET },
      status: "completed",
      attempts: 1,
      completedAt: day1,
      createdAt: day1,
    });
    await db.insert(disciplinaryNotificationJobs).values({
      deduplicationKey: `log:${MARK}:disciplinary`,
      userId: ids.person,
      entityType: "infraction",
      entityId: 4242,
      notificationKind: "registered",
      recipientEmail: `lola-${MARK}@example.test`,
      payload: { secret: PAYLOAD_SECRET },
      status: "failed",
      attempts: 5,
      // Outboxes store the thrown message: a query error quotes its params.
      lastError: `Failed query: select 1\nparams: ${PAYLOAD_SECRET},lola-${MARK}@example.test`,
      createdAt: day1,
    });
  }, 60_000);

  beforeEach(() => {
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue({ id: ids.admin, role: "admin" });
  });

  afterAll(async () => {
    const db = integrationDb;
    if (db) {
      const userIds = [ids.admin, ids.person, ids.other].filter(Boolean);
      await db
        .delete(reservationNotificationJobs)
        .where(
          sql`${reservationNotificationJobs.deduplicationKey} like ${`log:${MARK}:%`}`,
        );
      await db
        .delete(disciplinaryNotificationJobs)
        .where(
          sql`${disciplinaryNotificationJobs.deduplicationKey} like ${`log:${MARK}:%`}`,
        );
      await db
        .delete(notificationDeliveries)
        .where(
          sql`${notificationDeliveries.idempotencyKey} like ${`log:${MARK}:%`}`,
        );
      if (userIds.length > 0) {
        // Cascades to their inbox items and devices.
        await db.delete(users).where(inArray(users.id, userIds));
      }
      if (ids.campaign) {
        await db
          .delete(notificationCampaigns)
          .where(inArray(notificationCampaigns.id, [ids.campaign]));
      }
      if (ids.visitor) {
        await db.delete(visitors).where(inArray(visitors.id, [ids.visitor]));
      }
    }
    await pool?.end();
  });

  it("refuses anyone but an admin", async () => {
    requireAdmin.mockResolvedValue(null);
    expect(await queries.fetchNotificationLogPage(params())).toBeNull();
  });

  it("merges the four sources newest first, with one count", async () => {
    const { rows, total } = await page();
    expect(total).toBe(rows.length);
    // Ties on time go by source, then newest id.
    expect(rows.map((row) => `${row.source}:${row.kind}`)).toEqual([
      // Day 3
      "delivery:credit_gift_received",
      "delivery:comunicado_contact",
      // Day 2: the inbox item, then its push and email.
      "delivery:comunicado",
      "delivery:comunicado",
      "inbox:comunicado",
      // Day 1
      "disciplinary_outbox:infraction_registered",
      "inbox:infraction_registered",
      "reservation_outbox:settlement_approved",
    ]);
    expect(rows[2]!.channel).toBe("push");
    // Ordered by time, newest first.
    const times = rows.map((row) => row.createdAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(bySource(rows, "inbox")).toHaveLength(2);
    expect(bySource(rows, "delivery")).toHaveLength(4);
    expect(bySource(rows, "reservation_outbox")).toHaveLength(1);
    expect(bySource(rows, "disciplinary_outbox")).toHaveLength(1);
    expect(total).toBe(8);
  });

  it("pages without repeating or losing rows", async () => {
    const all = (await page()).rows.map((row) => row.key);
    const seen: string[] = [];
    for (let offset = 0; offset < all.length; offset += 3) {
      const { rows, total } = await page({ limit: 3, offset });
      expect(total).toBe(all.length);
      seen.push(...rows.map((row) => row.key));
    }
    expect(seen).toEqual(all);
  });

  it("describes each row: who, what, status, error and links", async () => {
    const { rows } = await page();

    const inbox = rows.find(
      (row) => row.source === "inbox" && row.kind === "comunicado",
    )!;
    expect(inbox).toMatchObject({
      channel: "in_app",
      status: "sent",
      title: "Cambio de horario",
      reserved: false,
      recipient: {
        userId: ids.person,
        name: `Lola ${MARK}`,
        email: `lola-${MARK}@example.test`,
      },
      links: [
        {
          label: "Ver reporte del comunicado",
          href: `/dashboard/communications/${ids.campaign}`,
        },
      ],
    });
    expect(inbox.readAt).toBeInstanceOf(Date);
    expect(inbox.createdAt.toISOString()).toBe("2026-03-02T15:00:00.000Z");

    const push = rows.find((row) => row.channel === "push")!;
    expect(push).toMatchObject({
      status: "failed",
      error: "push_gone: 410",
      attempts: 3,
      deviceLabel: "iPhone de Lola",
      deviceRemoved: false,
      title: "Cambio de horario",
    });

    const visitor = rows.find((row) => row.kind === "comunicado_contact")!;
    expect(visitor).toMatchObject({
      status: "skipped",
      lane: "bulk",
      error: "suppressed",
      // No inbox copy: the campaign's title says what it was.
      title: "Cambio de horario",
      recipient: { userId: null, email: `vera-${MARK}@example.test` },
    });

    const reservation = bySource(rows, "reservation_outbox")[0]!;
    expect(reservation).toMatchObject({
      channel: "email",
      status: "sent",
      kind: "settlement_approved",
      reserved: false,
    });
    expect(reservation.sentAt?.toISOString()).toBe("2026-03-01T15:00:00.000Z");
  });

  it("keeps disciplinary content off the list and links to the case", async () => {
    const { rows } = await page();
    const disciplinary = rows.filter(
      (row) =>
        row.source === "disciplinary_outbox" ||
        row.kind === "infraction_registered",
    );
    expect(disciplinary).toHaveLength(2);
    expect(bySource(disciplinary, "disciplinary_outbox")[0]!.error).toBe(
      "Failed query",
    );
    for (const row of disciplinary) {
      expect(row.reserved).toBe(true);
      expect(row.title).toBeNull();
      expect(row.kind).toBe("infraction_registered");
      expect(row.links).toEqual([
        { label: "Ver la infracción", href: "/dashboard/infractions/4242" },
      ]);
    }
  });

  it("never sends push endpoints, keys or payloads to the page", async () => {
    const serialized = JSON.stringify(await page());
    expect(serialized).not.toContain(PUSH_SECRET);
    expect(serialized).not.toContain(PAYLOAD_SECRET);
    expect(serialized).not.toContain("Motivo reservado");
  });

  it("filters by channel", async () => {
    const inApp = await page({ channel: ["in_app"] });
    expect(inApp.rows.every((row) => row.channel === "in_app")).toBe(true);
    expect(inApp.total).toBe(2);

    const push = await page({ channel: ["push"] });
    expect(push.rows.map((row) => row.channel)).toEqual(["push"]);

    // Email includes both outboxes.
    const email = await page({ channel: ["email"] });
    expect(email.total).toBe(5);
    expect(email.rows.every((row) => row.channel === "email")).toBe(true);

    const two = await page({ channel: ["in_app", "push"] });
    expect(two.total).toBe(3);
  });

  it("filters by status, reading the outboxes' completed as sent", async () => {
    const sent = await page({ status: ["sent"] });
    expect(sent.rows.every((row) => row.status === "sent")).toBe(true);
    // Two inbox items, one email delivery, one reservation job.
    expect(sent.total).toBe(4);

    const failed = await page({ status: ["failed"] });
    expect(failed.rows.map((row) => row.source).sort()).toEqual([
      "delivery",
      "disciplinary_outbox",
    ]);

    const pendingInApp = await page({
      status: ["pending"],
      channel: ["in_app"],
    });
    expect(pendingInApp).toEqual({ rows: [], total: 0 });
  });

  it("filters by Bolivian calendar days, inclusive", async () => {
    const day2 = await page({ from: "2026-03-02", to: "2026-03-02" });
    expect(day2.total).toBe(3);
    expect(
      day2.rows.every(
        (row) => row.createdAt.toISOString().slice(0, 10) === "2026-03-02",
      ),
    ).toBe(true);

    const fromDay2 = await page({ from: "2026-03-02" });
    expect(fromDay2.total).toBe(5);

    const toDay1 = await page({ to: "2026-03-01" });
    expect(toDay1.total).toBe(3);

    // A reversed range reads as the same days.
    const reversed = await page({ from: "2026-03-03", to: "2026-03-02" });
    expect(reversed.total).toBe(5);
  });

  it("searches by name, account email, address sent to, visitor name and #id", async () => {
    const byName = await page({ query: `lola ${MARK}` });
    expect(byName.total).toBe(6);
    expect(
      byName.rows.every(
        (row) =>
          row.recipient.userId === ids.person ||
          row.recipient.email === `lola-${MARK}@example.test`,
      ),
    ).toBe(true);

    const byEmail = await page({ query: `LOLA-${MARK}@example.test` });
    expect(byEmail.total).toBe(6);

    const byVisitorName = await page({ query: `vera visita ${MARK}` });
    expect(byVisitorName.rows.map((row) => row.kind)).toEqual([
      "comunicado_contact",
    ]);

    const byId = await page({ query: `#${ids.other}` });
    expect(byId.rows.map((row) => row.recipient.userId)).toEqual([ids.other]);

    // Wildcards are literal.
    expect((await page({ query: `lola%${MARK}` })).total).toBe(0);
  });
});
