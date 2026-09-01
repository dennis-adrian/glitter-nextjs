// @vitest-environment node

import { randomUUID } from "crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { FESTIVAL_TERMS_DOCUMENT_SLUG } from "@/app/lib/festival-terms/constants";
import * as schema from "@/db/schema";
import {
  festivalTermsDocuments,
  festivalTermsVersions,
  festivals,
  reservationRequestRegistry,
  standHolds,
  stands,
  userRequests,
  users,
} from "@/db/schema";

const currentProfileMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));
vi.mock("@/app/lib/reservations/notification-outbox", () => ({
  enqueueAdminAndOwnerNotifications: vi.fn().mockResolvedValue([]),
  enqueueReservationNotification: vi.fn(),
  scheduleReservationNotificationJobs: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

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
  ? new Pool({ connectionString: testDatabaseUrl, max: 5 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type Fixture = {
  festivalId: number;
  standIds: number[];
  userIds: number[];
  requestIds: number[];
  requestKeys: string[];
};

const fixtures: Fixture[] = [];
let createStandHold: (typeof import("@/app/lib/reservations/hold-service"))["createStandHold"];
let publishedTermsVersionId: number;

describeDatabase("createStandHold concurrency", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    ({ createStandHold } = await import("@/app/lib/reservations/hold-service"));

    const db = integrationDb!;
    const document = await db.query.festivalTermsDocuments.findFirst({
      where: eq(festivalTermsDocuments.slug, FESTIVAL_TERMS_DOCUMENT_SLUG),
    });
    if (!document) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
    const published = await db.query.festivalTermsVersions.findFirst({
      where: eq(festivalTermsVersions.status, "published"),
      orderBy: [desc(festivalTermsVersions.versionNumber)],
    });
    if (!published) {
      throw new Error("Missing published festival terms version in test DB.");
    }
    publishedTermsVersionId = published.id;
  }, 60_000);

  afterEach(async () => {
    currentProfileMock.mockReset();
    const db = integrationDb!;
    const leftover = fixtures.splice(0);
    for (const fixture of leftover) {
      if (fixture.requestKeys.length > 0) {
        await db
          .delete(reservationRequestRegistry)
          .where(
            inArray(reservationRequestRegistry.requestKey, fixture.requestKeys),
          );
      }
      await db
        .delete(standHolds)
        .where(eq(standHolds.festivalId, fixture.festivalId));
      for (const standId of fixture.standIds) {
        await db
          .update(stands)
          .set({ status: "available" })
          .where(eq(stands.id, standId));
        await db.delete(stands).where(eq(stands.id, standId));
      }
      for (const requestId of fixture.requestIds) {
        await db.delete(userRequests).where(eq(userRequests.id, requestId));
      }
      for (const userId of fixture.userIds) {
        await db.delete(users).where(eq(users.id, userId));
      }
      await db.delete(festivals).where(eq(festivals.id, fixture.festivalId));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function seedEligibleFixture(userCount: number, standCount: number) {
    const db = integrationDb!;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const requestKeys: string[] = [];

    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Hold Concurrency ${suffix}`,
        status: "active",
        festivalType: "glitter",
        participantTermsEnabled: true,
        reservationsStartDate: new Date(Date.now() - 60_000),
      })
      .returning();

    const insertedUsers = await db
      .insert(users)
      .values(
        Array.from({ length: userCount }, (_, index) => ({
          clerkId: `hold-concurrency-${suffix}-${index}`,
          email: `hold-concurrency-${suffix}-${index}@example.test`,
          displayName: `Hold User ${suffix}-${index}`,
          status: "verified" as const,
          category: "illustration" as const,
        })),
      )
      .returning();

    const enrollmentRows = await db
      .insert(userRequests)
      .values(
        insertedUsers.map((user) => ({
          userId: user.id,
          festivalId: festival.id,
          type: "festival_participation" as const,
          status: "accepted" as const,
          termsVersionId: publishedTermsVersionId,
        })),
      )
      .returning();

    const insertedStands = await db
      .insert(stands)
      .values(
        Array.from({ length: standCount }, (_, index) => ({
          festivalId: festival.id,
          standNumber: index + 1,
          standCategory: "illustration" as const,
          status: "available" as const,
          price: 100,
        })),
      )
      .returning();

    const fixture: Fixture = {
      festivalId: festival.id,
      standIds: insertedStands.map((stand) => stand.id),
      userIds: insertedUsers.map((user) => user.id),
      requestIds: enrollmentRows.map((row) => row.id),
      requestKeys,
    };
    fixtures.push(fixture);

    return {
      festival,
      users: insertedUsers,
      stands: insertedStands,
      trackRequestKey(key: string) {
        requestKeys.push(key);
      },
    };
  }

  it("allows only one concurrent hold when two participants target the same stand", async () => {
    const { users: [userA, userB], stands: [stand], trackRequestKey } =
      await seedEligibleFixture(2, 1);
    const keyA = randomUUID();
    const keyB = randomUUID();
    trackRequestKey(keyA);
    trackRequestKey(keyB);

    currentProfileMock
      .mockResolvedValueOnce({ id: userA.id, role: "user", status: "verified" })
      .mockResolvedValueOnce({ id: userB.id, role: "user", status: "verified" });

    const [resultA, resultB] = await Promise.all([
      createStandHold({ standId: stand.id, idempotencyKey: keyA }),
      createStandHold({ standId: stand.id, idempotencyKey: keyB }),
    ]);

    const successes = [resultA, resultB].filter((result) => result.success);
    const failures = [resultA, resultB].filter((result) => !result.success);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.code).toBe("STAND_UNAVAILABLE");

    const holds = await integrationDb!.query.standHolds.findMany({
      where: eq(standHolds.standId, stand.id),
    });
    expect(holds).toHaveLength(1);
  });

  it("keeps at most one live hold when the same participant targets two stands concurrently", async () => {
    const { users: [user], stands, trackRequestKey } = await seedEligibleFixture(
      1,
      2,
    );
    const [standA, standB] = stands;
    const keyA = randomUUID();
    const keyB = randomUUID();
    trackRequestKey(keyA);
    trackRequestKey(keyB);

    currentProfileMock.mockResolvedValue({
      id: user.id,
      role: "user",
      status: "verified",
    });

    const [resultA, resultB] = await Promise.all([
      createStandHold({ standId: standA.id, idempotencyKey: keyA }),
      createStandHold({ standId: standB.id, idempotencyKey: keyB }),
    ]);

    const holds = await integrationDb!.query.standHolds.findMany({
      where: eq(standHolds.userId, user.id),
    });
    expect(holds).toHaveLength(1);
    expect([standA.id, standB.id]).toContain(holds[0]?.standId);

    const successes = [resultA, resultB].filter((result) => result.success);
    expect(successes.length).toBeGreaterThanOrEqual(1);
  });

  it("treats an expired hold with stale held status as immediately reservable", async () => {
    const {
      festival,
      users: [holder, challenger],
      stands: [stand],
      trackRequestKey,
    } = await seedEligibleFixture(2, 1);

    const createdAt = new Date(Date.now() - 120_000);
    const expiresAt = new Date(Date.now() - 60_000);
    await integrationDb!.insert(standHolds).values({
      standId: stand.id,
      userId: holder.id,
      festivalId: festival.id,
      createdAt,
      updatedAt: expiresAt,
      expiresAt,
    });
    await integrationDb!
      .update(stands)
      .set({ status: "held" })
      .where(eq(stands.id, stand.id));

    const key = randomUUID();
    trackRequestKey(key);
    currentProfileMock.mockResolvedValue({
      id: challenger.id,
      role: "user",
      status: "verified",
    });

    const result = await createStandHold({
      standId: stand.id,
      idempotencyKey: key,
    });

    expect(result.success).toBe(true);

    const holds = await integrationDb!.query.standHolds.findMany({
      where: eq(standHolds.standId, stand.id),
    });
    expect(holds).toHaveLength(1);
    expect(holds[0]?.userId).toBe(challenger.id);
    expect(holds[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const [freshStand] = await integrationDb!
      .select({ status: stands.status })
      .from(stands)
      .where(eq(stands.id, stand.id));
    expect(freshStand?.status).toBe("held");
  });
});
