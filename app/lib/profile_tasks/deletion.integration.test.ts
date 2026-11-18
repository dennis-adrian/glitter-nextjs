// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
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

import * as schema from "@/db/schema";
import {
  festivalSectors,
  festivals,
  pendingUserDeletions,
  reservationParticipants,
  scheduledTasks,
  standReservationStands,
  standReservations,
  stands,
  users,
} from "@/db/schema";

const deleteClerkUser = vi.hoisted(() => vi.fn());
const clerkLoginStatus = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/lib/users/clerk", () => ({ deleteClerkUser, clerkLoginStatus }));
vi.mock("@/app/vendors/resend", () => ({ sendEmail }));
// The real helper sleeps between batches; the loop is what matters here.
vi.mock("@/app/lib/emails/helpers", () => ({
  queueEmails: async (
    entities: unknown[],
    callback: (entity: unknown) => Promise<void>,
  ) => {
    for (const entity of entities) await callback(entity);
  },
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

const fixtures: {
  festivalIds: number[];
  userIds: number[];
  clerkIds: string[];
} = { festivalIds: [], userIds: [], clerkIds: [] };

let cron: typeof import("@/app/lib/profile_tasks/actions");

/**
 * The cron removes profiles whose sign-up was never completed. These cases
 * run it against Postgres: the claim, the blocker check, the shared delete
 * and the release all take real row locks.
 */
describeDatabase("the profile-deletion cron", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    cron = await import("@/app/lib/profile_tasks/actions");
  }, 60_000);

  afterEach(async () => {
    deleteClerkUser.mockReset();
    clerkLoginStatus.mockReset();
    sendEmail.mockReset();
    const db = integrationDb!;
    const { festivalIds, userIds, clerkIds } = fixtures;
    if (festivalIds.length > 0) {
      const reservationIds = (
        await db
          .select({ id: standReservations.id })
          .from(standReservations)
          .where(inArray(standReservations.festivalId, festivalIds))
      ).map((row) => row.id);
      if (reservationIds.length > 0) {
        await db
          .delete(reservationParticipants)
          .where(
            inArray(reservationParticipants.reservationId, reservationIds),
          );
        await db
          .delete(standReservationStands)
          .where(inArray(standReservationStands.reservationId, reservationIds));
        await db
          .delete(standReservations)
          .where(inArray(standReservations.id, reservationIds));
      }
      await db.delete(stands).where(inArray(stands.festivalId, festivalIds));
      await db
        .delete(festivalSectors)
        .where(inArray(festivalSectors.festivalId, festivalIds));
      await db.delete(festivals).where(inArray(festivals.id, festivalIds));
    }
    if (clerkIds.length > 0) {
      await db
        .delete(pendingUserDeletions)
        .where(inArray(pendingUserDeletions.clerkId, clerkIds));
    }
    if (userIds.length > 0) {
      // Their tasks cascade.
      await db.delete(users).where(inArray(users.id, userIds));
    }
    fixtures.festivalIds = [];
    fixtures.userIds = [];
    fixtures.clerkIds = [];
  });

  afterAll(async () => {
    await pool?.end();
  });

  /** A profile whose completion deadline has passed. */
  async function seedOverdue() {
    const db = integrationDb!;
    const suffix = randomUUID().slice(0, 8);
    const [profile] = await db
      .insert(users)
      .values({
        clerkId: `cron-${suffix}`,
        email: `cron-${suffix}@example.test`,
        displayName: `Cron ${suffix}`,
        status: "pending",
        role: "user",
        category: "illustration",
      })
      .returning();
    fixtures.userIds.push(profile.id);
    fixtures.clerkIds.push(profile.clerkId);
    const [task] = await db
      .insert(scheduledTasks)
      .values({
        profileId: profile.id,
        taskType: "profile_creation",
        dueDate: new Date(Date.now() - 60 * 60_000),
        reminderTime: new Date(Date.now() - 2 * 60 * 60_000),
      })
      .returning();
    return { profile, task };
  }

  /** What keeps a profile: a place in a festival reservation. */
  async function giveParticipation(profileId: number) {
    const db = integrationDb!;
    const suffix = randomUUID().slice(0, 8);
    const [festival] = await db
      .insert(festivals)
      .values({
        name: `Cron ${suffix}`,
        status: "archived",
        festivalType: "glitter",
        reservationsStartDate: new Date(Date.now() - 60_000),
      })
      .returning();
    fixtures.festivalIds.push(festival.id);
    const [sector] = await db
      .insert(festivalSectors)
      .values({
        name: `S ${suffix}`,
        festivalId: festival.id,
        orderInFestival: 1,
      })
      .returning();
    const [stand] = await db
      .insert(stands)
      .values({
        festivalId: festival.id,
        festivalSectorId: sector.id,
        standNumber: 1,
        standCategory: "illustration",
        status: "confirmed",
        price: 100,
        individualPrice: 100,
      })
      .returning();
    const [reservation] = await db
      .insert(standReservations)
      .values({
        festivalId: festival.id,
        standId: stand.id,
        status: "accepted",
        source: "admin_assignment",
        ownerUserId: profileId,
        priceAmountSnapshot: 100,
        individualPriceSnapshot: 100,
      })
      .returning();
    await db.insert(standReservationStands).values({
      reservationId: reservation.id,
      standId: stand.id,
      position: 0,
    });
    await db
      .insert(reservationParticipants)
      .values({ userId: profileId, reservationId: reservation.id });
  }

  const pendingFor = (clerkId: string) =>
    integrationDb!
      .select()
      .from(pendingUserDeletions)
      .where(eq(pendingUserDeletions.clerkId, clerkId));
  const userRow = (id: number) =>
    integrationDb!.select().from(users).where(eq(users.id, id));
  const taskRow = (id: number) =>
    integrationDb!
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, id));

  it("deletes the login and then the profile, and sends the notice", async () => {
    const { profile, task } = await seedOverdue();
    deleteClerkUser.mockResolvedValue({
      success: true,
      status: "deleted",
      message: "ok",
    });
    sendEmail.mockResolvedValue({ data: { id: "e1" }, error: null });

    const done = await cron.handleDeletionEmails();

    expect(done.map((t) => t.id)).toContain(task.id);
    expect(deleteClerkUser).toHaveBeenCalledWith(profile.clerkId);
    expect(await userRow(profile.id)).toEqual([]);
    const [pending] = await pendingFor(profile.clerkId);
    expect(pending.clerkDeletedAt).not.toBeNull();
    expect(pending.clerkAttemptedAt).toBeNull();
    expect(pending.localDeletedAt).not.toBeNull();
    expect(pending.emailSentAt).not.toBeNull();
  });

  it("never asks Clerk about a profile that has to stay, and closes its task", async () => {
    const { profile, task } = await seedOverdue();
    await giveParticipation(profile.id);

    await cron.handleDeletionEmails();

    expect(deleteClerkUser).not.toHaveBeenCalled();
    expect(clerkLoginStatus).not.toHaveBeenCalled();
    expect(await userRow(profile.id)).toHaveLength(1);
    expect(await pendingFor(profile.clerkId)).toEqual([]);
    const [closed] = await taskRow(task.id);
    expect(closed.ranAfterDueDate).toBe(true);

    // A later run does not pick it up again.
    await cron.handleDeletionEmails();
    expect(deleteClerkUser).not.toHaveBeenCalled();
  });

  it("keeps a profile Clerk would not let go, and retries it later", async () => {
    const { profile, task } = await seedOverdue();
    deleteClerkUser.mockResolvedValue({
      success: false,
      status: "request_failed",
      message: "boom",
    });
    clerkLoginStatus.mockResolvedValue("exists");

    await cron.handleDeletionEmails();

    expect(await userRow(profile.id)).toHaveLength(1);
    const [pending] = await pendingFor(profile.clerkId);
    expect(pending.localDeletedAt).toBeNull();
    expect(pending.clerkAttemptedAt).toBeNull();
    expect(pending.attempts).toBe(1);
    expect(pending.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    const [open] = await taskRow(task.id);
    expect(open.ranAfterDueDate).toBe(false);
  });

  it("keeps an unanswered attempt on the row until Clerk can settle it", async () => {
    const { profile } = await seedOverdue();
    // Never answers: the step's own time bound ends it.
    deleteClerkUser.mockImplementation(() => new Promise(() => {}));
    clerkLoginStatus.mockResolvedValue("unknown");

    await cron.handleDeletionEmails();

    expect(await userRow(profile.id)).toHaveLength(1);
    const [pending] = await pendingFor(profile.clerkId);
    expect(pending.clerkAttemptedAt).not.toBeNull();
    expect(pending.clerkDeletedAt).toBeNull();
    expect(pending.lastError).toContain("timed out");
    expect(pending.attempts).toBe(1);
  }, 30_000);

  it("gives a profile that gained a participation back once Clerk is sure", async () => {
    const { profile, task } = await seedOverdue();
    // An earlier run's attempt went unanswered long ago; since then the
    // profile joined a reservation.
    await integrationDb!.insert(pendingUserDeletions).values({
      userId: profile.id,
      clerkId: profile.clerkId,
      clerkAttemptedAt: new Date(Date.now() - 10 * 60_000),
      lastError: "clerk_delete_failed: timed out",
      attempts: 1,
      nextAttemptAt: new Date(Date.now() - 1000),
    });
    await giveParticipation(profile.id);
    clerkLoginStatus.mockResolvedValue("exists");

    await cron.handleDeletionEmails();

    expect(deleteClerkUser).not.toHaveBeenCalled();
    expect(clerkLoginStatus).toHaveBeenCalledWith(profile.clerkId);
    expect(await userRow(profile.id)).toHaveLength(1);
    // Released: credits, notices and push stop treating it as leaving.
    expect(await pendingFor(profile.clerkId)).toEqual([]);
    const [closed] = await taskRow(task.id);
    expect(closed.ranAfterDueDate).toBe(true);
  });

  it("parks a kept profile whose login is already gone for an operator", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { profile } = await seedOverdue();
    await integrationDb!.insert(pendingUserDeletions).values({
      userId: profile.id,
      clerkId: profile.clerkId,
      clerkDeletedAt: new Date(Date.now() - 60_000),
      nextAttemptAt: new Date(Date.now() - 1000),
    });
    await giveParticipation(profile.id);

    await cron.handleDeletionEmails();

    expect(deleteClerkUser).not.toHaveBeenCalled();
    expect(await userRow(profile.id)).toHaveLength(1);
    const [pending] = await pendingFor(profile.clerkId);
    expect(pending.localDeletedAt).toBeNull();
    expect(pending.attempts).toBe(5);
    expect(pending.lastError).toBe(
      "blocked_after_login_removed: participations",
    );
    vi.restoreAllMocks();
  });
});
