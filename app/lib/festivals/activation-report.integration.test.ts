// @vitest-environment node

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import {
  festivals,
  notificationDeliveries,
  notifications,
  pushSubscriptions,
  userRequests,
  users,
} from "@/db/schema";

vi.mock("server-only", () => ({}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string): boolean {
  try {
    const databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
    return /(^|[_-])(test|ci)([_-]|$)/i.test(databaseName);
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
  ? new Pool({ connectionString: testDatabaseUrl })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

let report: typeof import("@/app/lib/festivals/activation-report");
let notifyMany: (typeof import("@/app/lib/notifications/notify"))["notifyMany"];

const KIND = "festival_participant_invitation" as const;
const created = { festivals: [] as number[], users: [] as number[] };

function tag() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describeDatabase("activation notice report", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    report = await import("@/app/lib/festivals/activation-report");
    ({ notifyMany } = await import("@/app/lib/notifications/notify"));

    const result = await pool!.query<{ festivals: string | null }>(
      "select to_regclass('public.festivals')::text as festivals",
    );
    if (!result.rows[0]?.festivals) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
  }, 60_000);

  afterEach(async () => {
    const db = integrationDb!;
    const userIds = created.users.splice(0);
    if (userIds.length > 0) {
      // Their inbox items, deliveries, devices and requests go with them.
      await db.delete(users).where(inArray(users.id, userIds));
    }
    const festivalIds = created.festivals.splice(0);
    if (festivalIds.length > 0) {
      await db
        .delete(userRequests)
        .where(inArray(userRequests.festivalId, festivalIds));
      await db.delete(festivals).where(inArray(festivals.id, festivalIds));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function makeFestival() {
    const [festival] = await integrationDb!
      .insert(festivals)
      .values({
        name: `Report ${tag()}`,
        status: "active",
        festivalType: "glitter",
      })
      .returning();
    created.festivals.push(festival!.id);
    return festival!;
  }

  async function makeUser(name: string, devices = 0) {
    const t = tag();
    const [user] = await integrationDb!
      .insert(users)
      .values({
        clerkId: `clerk-report-${t}`,
        email: `report-${t}@example.test`,
        displayName: name,
        status: "verified",
        category: "illustration",
      })
      .returning();
    created.users.push(user!.id);
    for (let i = 0; i < devices; i++) {
      await integrationDb!.insert(pushSubscriptions).values({
        userId: user!.id,
        endpoint: `https://push.example.test/${t}/${i}`,
        p256dh: "p256dh",
        auth: "auth",
        applicationServerKey: "key",
      });
    }
    return user!;
  }

  async function sendNotice(festivalId: number, userIds: number[]) {
    await integrationDb!.transaction((tx) =>
      notifyMany(tx as never, {
        kind: KIND,
        data: {
          festivalId,
          festivalName: "Report",
          reservationsStartDate: "2099-11-20T14:00:00.000Z",
          reservationsOpen: false,
        },
        userIds,
        dedupeKey: `festival-participant-invitation:${festivalId}`,
        push: true,
      }),
    );
    return integrationDb!
      .select()
      .from(notifications)
      .where(inArray(notifications.userId, userIds));
  }

  async function setPushStatuses(
    notificationId: number,
    statuses: ("sent" | "failed" | "skipped" | "pending")[],
  ) {
    const rows = await integrationDb!
      .select({ id: notificationDeliveries.id })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.notificationId, notificationId))
      .orderBy(notificationDeliveries.id);
    expect(rows).toHaveLength(statuses.length);
    for (const [index, row] of rows.entries()) {
      await integrationDb!
        .update(notificationDeliveries)
        .set({
          status: statuses[index]!,
          ...(statuses[index] === "sent" ? { sentAt: new Date() } : {}),
        })
        .where(eq(notificationDeliveries.id, row.id));
    }
  }

  async function enroll(
    userId: number,
    festivalId: number,
    createdAt: Date,
    status: "pending" | "accepted" = "accepted",
  ) {
    await integrationDb!.insert(userRequests).values({
      userId,
      festivalId,
      type: "festival_participation",
      status,
      createdAt,
    });
  }

  it("is null for a festival whose notice never went out", async () => {
    const festival = await makeFestival();
    expect(await report.fetchActivationReport(festival.id)).toBeNull();
    expect(await report.fetchActivationRecipients(festival.id)).toEqual({
      recipients: [],
      total: 0,
    });
  });

  it("counts reads, pushes by outcome and enrollments after the notice", async () => {
    const festival = await makeFestival();
    const ana = await makeUser("Ana", 2);
    const bruno = await makeUser("Bruno", 1);
    const carla = await makeUser("Carla");
    const dani = await makeUser("Dani", 1);
    const before = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Dani had asked before the notice; the others had not.
    await enroll(dani.id, festival.id, before, "pending");

    const items = await sendNotice(festival.id, [
      ana.id,
      bruno.id,
      carla.id,
      dani.id,
    ]);
    const item = (userId: number) =>
      items.find((row) => row.userId === userId)!;

    await setPushStatuses(item(ana.id).id, ["sent", "failed"]);
    await setPushStatuses(item(bruno.id).id, ["skipped"]);
    // Dani's push is still pending.
    await integrationDb!
      .update(notifications)
      .set({ readAt: new Date() })
      .where(inArray(notifications.id, [item(ana.id).id, item(carla.id).id]));
    await enroll(ana.id, festival.id, new Date(Date.now() + 60_000));

    // Another festival's notice is not this one's.
    const other = await makeFestival();
    const outsider = await makeUser("Elena", 1);
    await sendNotice(other.id, [outsider.id]);

    const result = await report.fetchActivationReport(festival.id);
    expect(result).not.toBeNull();
    expect(result!.kpis).toEqual({
      notified: 4,
      read: 2,
      pushReached: 1,
      pushSent: 1,
      pushFailed: 2,
      pushPending: 1,
      enrolledAfter: 1,
      enrolledBefore: 1,
    });
    // Read back as the instant it was written, whatever the server's zone.
    expect(
      Math.abs(
        result!.sentAt.getTime() - item(ana.id).createdAt.getTime(),
      ),
    ).toBeLessThan(1000);

    const { recipients, total } = await report.fetchActivationRecipients(
      festival.id,
    );
    expect(total).toBe(4);
    expect(recipients.map((row) => row.name)).toEqual([
      "Ana",
      "Bruno",
      "Carla",
      "Dani",
    ]);
    expect(recipients[0]).toMatchObject({
      userId: ana.id,
      push: { sent: 1, failed: 1, pending: 0 },
      enrollment: { status: "accepted", afterNotice: true },
    });
    expect(recipients[0]!.readAt).toBeInstanceOf(Date);
    expect(recipients[2]).toMatchObject({
      push: { sent: 0, failed: 0, pending: 0 },
      enrollment: null,
    });
    expect(recipients[3]).toMatchObject({
      readAt: null,
      push: { sent: 0, failed: 0, pending: 1 },
      enrollment: { status: "pending", afterNotice: false },
    });
  });

  it("filters by read and enrollment, and pages", async () => {
    const festival = await makeFestival();
    const people = [];
    for (let i = 0; i < 3; i++) people.push(await makeUser(`P${i}`));
    const items = await sendNotice(
      festival.id,
      people.map((person) => person.id),
    );
    await integrationDb!
      .update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.id, items[0]!.id));
    await enroll(people[1]!.id, festival.id, new Date(Date.now() + 60_000));

    const names = async (filter: (typeof report.ACTIVATION_RECIPIENT_FILTERS)[number]) =>
      (
        await report.fetchActivationRecipients(festival.id, { filter })
      ).recipients.map((row) => row.userId);

    expect(await names("read")).toEqual([items[0]!.userId]);
    expect((await names("unread")).sort()).toEqual(
      items
        .slice(1)
        .map((row) => row.userId)
        .sort(),
    );
    expect(await names("enrolled")).toEqual([people[1]!.id]);
    expect(await names("not_enrolled")).toHaveLength(2);

    const second = await report.fetchActivationRecipients(festival.id, {
      page: 2,
    });
    // Past the end: no rows, but the total still says how many match.
    expect(second).toEqual({ recipients: [], total: 3 });
  });
});
