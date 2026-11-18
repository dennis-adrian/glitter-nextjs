// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
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
  vi,
} from "vitest";

import * as schema from "@/db/schema";
import {
  disciplinaryNotificationJobs,
  festivalSectors,
  festivals,
  pendingUserDeletions,
  posts,
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

/**
 * Only a disposable, locally hosted database: these suites delete users, and
 * the cron's claim takes every overdue profile in the database. A test-like
 * name alone does not make a remote endpoint safe.
 */
const ALLOWED_TEST_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "host.docker.internal",
]);

/**
 * Judged on what pg will actually connect to. Query parameters can override
 * the host and database (`?host=…`), and a URL without a host makes pg fall
 * back to PGHOST, so either is refused rather than interpreted.
 */
function isSafeTestDatabase(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) return false;
    if (parsed.search !== "" || parsed.hash !== "") return false;
    if (parsed.hostname === "") return false;
    const databaseName = decodeURIComponent(parsed.pathname.slice(1));
    return (
      ALLOWED_TEST_HOSTS.has(parsed.hostname.toLowerCase()) &&
      /(^|[_-])(test|ci)([_-]|$)/i.test(databaseName)
    );
  } catch {
    return false;
  }
}

if (testDatabaseUrl && !isSafeTestDatabase(testDatabaseUrl)) {
  throw new Error(
    "TEST_DATABASE_URL must be a plain postgres:// URL to a local database whose name contains 'test' or 'ci', with no query parameters.",
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

  // The cron claims every overdue profile task in the database, not only this
  // suite's. Its cases are only meaningful, and only safe, when nothing else
  // is there to claim. Checked before each case seeds anything, so any task
  // found is foreign, a leftover of an interrupted run of this suite included.
  beforeEach(async () => {
    const { rows } = await pool!.query<{ count: string }>(`
      SELECT count(*) AS count
      FROM scheduled_tasks
      WHERE task_type = 'profile_creation'
        AND completed_at IS NULL
        AND ran_after_due_date = false
        AND due_date <= now()
    `);
    if (Number(rows[0].count) > 0) {
      throw new Error(
        "The test database already has overdue profile tasks, which the cron would claim. Remove them (a leftover run's profiles start with 'cron-') or run against a database of its own.",
      );
    }
  });

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
    expect(deleteClerkUser).toHaveBeenCalledWith(
      profile.clerkId,
      expect.any(AbortSignal),
    );
    expect(await userRow(profile.id)).toEqual([]);
    const [pending] = await pendingFor(profile.clerkId);
    expect(pending.clerkDeletedAt).not.toBeNull();
    expect(pending.clerkAttemptedAt).toBeNull();
    expect(pending.localDeletedAt).not.toBeNull();
    expect(pending.emailSentAt).not.toBeNull();
  });

  it("settles the profile's posts and scrubs its queued notices, as the admin does", async () => {
    const { profile } = await seedOverdue();
    deleteClerkUser.mockResolvedValue({
      success: true,
      status: "deleted",
      message: "ok",
    });
    const db = integrationDb!;
    const suffix = randomUUID();
    const [scheduled, published] = await db
      .insert(posts)
      .values(
        (["scheduled", "published"] as const).map((status) => ({
          title: `Artículo ${status}`,
          slug: `deletion-${status}-${suffix}`,
          content: [{ type: "paragraph", content: [] }],
          contentHtml: "<p></p>",
          authorId: profile.id,
          status,
          publishedAt: status === "published" ? new Date() : null,
        })),
      )
      .returning({ id: posts.id });
    let jobId: number | undefined;

    try {
      // Inside the try, so the posts are cleaned up even if this fails.
      const [job] = await db
        .insert(disciplinaryNotificationJobs)
        .values({
          deduplicationKey: `deletion-${suffix}`,
          userId: profile.id,
          entityType: "infraction",
          entityId: 1,
          notificationKind: "infraction_created",
          recipientEmail: profile.email,
          payload: { name: "Para borrar" },
        })
        .returning({ id: disciplinaryNotificationJobs.id });
      jobId = job.id;

      await cron.handleDeletionEmails();

      expect(await userRow(profile.id)).toEqual([]);
      // A scheduled post must not go out after its author is gone; the
      // published one stays under "Equipo Glitter".
      const left = await db
        .select({ id: posts.id, authorId: posts.authorId })
        .from(posts)
        .where(inArray(posts.id, [scheduled.id, published.id]));
      expect(left).toEqual([{ id: published.id, authorId: null }]);
      // The unsent notice is failed and keeps no address or details.
      const [scrubbed] = await db
        .select()
        .from(disciplinaryNotificationJobs)
        .where(eq(disciplinaryNotificationJobs.id, jobId));
      expect(scrubbed).toMatchObject({
        userId: null,
        status: "failed",
        recipientEmail: "",
      });
      expect(JSON.stringify(scrubbed.payload)).not.toContain("Para borrar");
    } finally {
      await db
        .delete(posts)
        .where(inArray(posts.id, [scheduled.id, published.id]));
      if (jobId !== undefined) {
        await db
          .delete(disciplinaryNotificationJobs)
          .where(eq(disciplinaryNotificationJobs.id, jobId));
      }
    }
  });

  it("finishes an incomplete sign-up whose login Clerk deleted on its own", async () => {
    const { profile, task } = await seedOverdue();
    sendEmail.mockResolvedValue({ data: { id: "e1" }, error: null });
    const { recordClerkLoginDeleted } =
      await import("@/app/lib/users/clerk-login-deleted");

    // Deleted in Clerk's dashboard, say: the webhook leaves it to the cron
    // instead of parking it where the cron would never claim it.
    expect(await recordClerkLoginDeleted(profile.clerkId)).toEqual({
      kind: "queued",
      profileId: profile.id,
    });

    const done = await cron.handleDeletionEmails();

    expect(done.map((t) => t.id)).toContain(task.id);
    expect(deleteClerkUser).not.toHaveBeenCalled();
    expect(await userRow(profile.id)).toEqual([]);
    const [pending] = await pendingFor(profile.clerkId);
    expect(pending.localDeletedAt).not.toBeNull();
  });

  it("takes back a parked sign-up once Clerk deletes its login on its own", async () => {
    const { profile, task } = await seedOverdue();
    sendEmail.mockResolvedValue({ data: { id: "e1" }, error: null });
    // Clerk refused it five times: parked, no longer claimed.
    await integrationDb!.insert(pendingUserDeletions).values({
      userId: profile.id,
      clerkId: profile.clerkId,
      attempts: 5,
      lastError: "clerk_refused: Error al eliminar la cuenta.",
      nextAttemptAt: new Date(Date.now() - 1000),
    });
    const { recordClerkLoginDeleted } =
      await import("@/app/lib/users/clerk-login-deleted");

    expect(await recordClerkLoginDeleted(profile.clerkId)).toEqual({
      kind: "queued",
      profileId: profile.id,
    });
    const done = await cron.handleDeletionEmails();

    expect(done.map((t) => t.id)).toContain(task.id);
    expect(deleteClerkUser).not.toHaveBeenCalled();
    expect(await userRow(profile.id)).toEqual([]);
  });

  it("does not park a row the webhook took back while the run was writing its failure", async () => {
    const { profile, task } = await seedOverdue();
    sendEmail.mockResolvedValue({ data: { id: "e1" }, error: null });
    // One short of the cap, with an earlier request still unconfirmed.
    await integrationDb!.insert(pendingUserDeletions).values({
      userId: profile.id,
      clerkId: profile.clerkId,
      attempts: 4,
      clerkAttemptedAt: new Date(Date.now() - 30_000),
      lastError: "clerk_delete_failed: timed out",
      nextAttemptAt: new Date(Date.now() - 1000),
    });
    // This run's request is refused and the login is still there...
    deleteClerkUser.mockResolvedValue({
      success: false,
      status: "request_failed",
      message: "Clerk 429",
      definite: true,
    });
    clerkLoginStatus.mockResolvedValue("exists");
    // ...then the earlier request lands, and Clerk's event is applied in the
    // gap before the run writes its failure.
    const core = await import("@/app/lib/users/profile-deletion");
    const { recordClerkLoginDeleted } =
      await import("@/app/lib/users/clerk-login-deleted");
    const original = core.finalizeProfileDeletion;
    const spy = vi
      .spyOn(core, "finalizeProfileDeletion")
      .mockImplementationOnce(async (input) => {
        const outcome = await original(input);
        expect(await recordClerkLoginDeleted(profile.clerkId)).toMatchObject({
          kind: "queued",
        });
        return outcome;
      });

    try {
      await cron.handleDeletionEmails();
    } finally {
      spy.mockRestore();
    }

    // Still claimable: the failure assumed a login that is no longer there.
    const [pending] = await pendingFor(profile.clerkId);
    expect(pending.attempts).toBe(0);
    expect(pending.clerkDeletedAt).not.toBeNull();

    // The next run finishes it without asking Clerk again.
    deleteClerkUser.mockClear();
    const done = await cron.handleDeletionEmails();
    expect(done.map((t) => t.id)).toContain(task.id);
    expect(deleteClerkUser).not.toHaveBeenCalled();
    expect(await userRow(profile.id)).toEqual([]);
  });

  it("records a failure of the first step on a row whose login is already gone", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { profile } = await seedOverdue();
    await integrationDb!.insert(pendingUserDeletions).values({
      userId: profile.id,
      clerkId: profile.clerkId,
      clerkDeletedAt: new Date(Date.now() - 60_000),
      attempts: 2,
      nextAttemptAt: new Date(Date.now() - 1000),
    });
    // The first transaction fails after reading the row (a query error).
    const blockers = await import("@/app/lib/users/deletion-blockers");
    const spy = vi
      .spyOn(blockers, "findProfileDeletionBlocker")
      .mockRejectedValueOnce(new Error("query failed"));

    try {
      await cron.handleDeletionEmails();
    } finally {
      vi.restoreAllMocks();
    }

    // Recorded, with its backoff: not skipped as if the login were still
    // there, which would have it claimed again every run with no trace.
    const [pending] = await pendingFor(profile.clerkId);
    expect(pending.attempts).toBe(3);
    expect(pending.lastError).toContain("local_delete_failed");
    expect(pending.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(spy).toHaveBeenCalled();
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
      definite: true,
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

  it("does not release a profile while an earlier unconfirmed request could land", async () => {
    const { profile, task } = await seedOverdue();
    // Run 1, a minute ago: the request went unanswered.
    const earlier = new Date(Date.now() - 60_000);
    await integrationDb!.insert(pendingUserDeletions).values({
      userId: profile.id,
      clerkId: profile.clerkId,
      clerkAttemptedAt: earlier,
      lastError: "clerk_delete_failed: timed out",
      attempts: 1,
      nextAttemptAt: new Date(Date.now() - 1000),
    });
    // Run 2: a definite no for its own request.
    deleteClerkUser.mockResolvedValue({
      success: false,
      status: "request_failed",
      message: "Clerk 429",
      definite: true,
    });
    clerkLoginStatus.mockResolvedValue("exists");

    await cron.handleDeletionEmails();

    let [pending] = await pendingFor(profile.clerkId);
    expect(pending.clerkAttemptedAt?.getTime()).toBe(earlier.getTime());
    expect(pending.attempts).toBe(2);

    // Run 3: the profile has gained a participation meanwhile. The first
    // request is still young enough to land, so the row is not released.
    await giveParticipation(profile.id);
    await integrationDb!
      .update(pendingUserDeletions)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(pendingUserDeletions.id, pending.id));
    deleteClerkUser.mockClear();

    await cron.handleDeletionEmails();

    expect(deleteClerkUser).not.toHaveBeenCalled();
    [pending] = await pendingFor(profile.clerkId);
    expect(pending.lastError).toBe("blocked_login_unconfirmed: participations");
    // Not a failed deletion: the attempts are left alone, and it is checked
    // again once the first request can no longer land.
    expect(pending.attempts).toBe(2);
    expect(pending.nextAttemptAt.getTime()).toBeGreaterThan(
      Date.now() + 4 * 60_000,
    );
    const [open] = await taskRow(task.id);
    expect(open.ranAfterDueDate).toBe(false);
  });

  it("parks a resumed row whose local delete keeps failing once it reaches the cap", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { profile } = await seedOverdue();
    // The login went in an earlier run; four local deletes have failed since.
    await integrationDb!.insert(pendingUserDeletions).values({
      userId: profile.id,
      clerkId: profile.clerkId,
      clerkDeletedAt: new Date(Date.now() - 10 * 60_000),
      attempts: 4,
      nextAttemptAt: new Date(Date.now() - 1000),
    });
    const posts = await import("@/app/lib/posts/anonymization");
    vi.spyOn(posts, "detachPostsForDeletedUser").mockRejectedValueOnce(
      new Error("still failing"),
    );

    await cron.handleDeletionEmails();

    expect(deleteClerkUser).not.toHaveBeenCalled();
    const [pending] = await pendingFor(profile.clerkId);
    expect(pending.attempts).toBe(5);
    expect(pending.clerkDeletedAt).not.toBeNull();
    expect(await userRow(profile.id)).toHaveLength(1);
    vi.restoreAllMocks();
  });

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
