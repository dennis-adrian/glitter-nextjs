// @vitest-environment node

import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
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
import { pendingUserDeletions, scheduledTasks, users } from "@/db/schema";

vi.mock("server-only", () => ({}));

const dbHolder = vi.hoisted(() => ({ current: null as never }));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => {
        const value = (dbHolder.current as never as Record<string, unknown>)[
          prop as string
        ];
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(dbHolder.current)
          : value;
      },
    },
  ),
}));

// Clerk stands in for the account that has to survive: a call for a profile
// means its sign-in is gone.
const deleteClerkUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/users/clerk", () => ({
  deleteClerkUser: deleteClerkUserMock,
}));
const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/vendors/resend", () => ({ sendEmail: sendEmailMock }));

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
  ? new Pool({ connectionString: testDatabaseUrl, max: 10 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

// Mirrors MAX_DELETIONS_PER_RUN: a full batch of credit holders ahead of a
// deletable profile is what would starve it.
const BATCH_SIZE = 25;

let handleDeletionEmails: (typeof import("@/app/lib/profile_tasks/actions"))["handleDeletionEmails"];

const createdUserIds: number[] = [];
const createdClerkIds: string[] = [];

/**
 * An incomplete profile whose profile_creation task is long overdue. The due
 * dates sit decades back so these come first in the oldest-first batch, ahead
 * of anything else in the shared test database.
 */
async function overdueProfile(dueDate: string) {
  const suffix = randomUUID();
  const clerkId = `profile-deletion-${suffix}`;
  const [user] = await integrationDb!
    .insert(users)
    .values({ clerkId, email: `profile-deletion-${suffix}@example.test` })
    .returning({ id: users.id, clerkId: users.clerkId });
  createdUserIds.push(user!.id);
  createdClerkIds.push(clerkId);

  const [task] = await integrationDb!
    .insert(scheduledTasks)
    .values({
      profileId: user!.id,
      taskType: "profile_creation",
      dueDate: new Date(dueDate),
      reminderTime: new Date(dueDate),
    })
    .returning({ id: scheduledTasks.id });

  return { ...user!, taskId: task!.id };
}

/** An admin grant, as a gift would leave it. */
async function grantCredits(
  userId: number,
  executor: Pick<PoolClient, "query"> = pool!,
) {
  await executor.query(
    `INSERT INTO credit_ledger_entries (user_id, amount, type, idempotency_key)
     VALUES ($1, 10, 'admin_grant', $2)`,
    [userId, `profile-deletion-${randomUUID()}`],
  );
}

async function userExists(userId: number) {
  const [row] = await integrationDb!
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId));
  return Boolean(row);
}

async function pendingRowsFor(clerkIds: string[]) {
  return integrationDb!
    .select()
    .from(pendingUserDeletions)
    .where(inArray(pendingUserDeletions.clerkId, clerkIds));
}

async function openTask(taskId: number) {
  const [row] = await integrationDb!
    .select({ completedAt: scheduledTasks.completedAt })
    .from(scheduledTasks)
    .where(eq(scheduledTasks.id, taskId));
  return row;
}

async function waitUntilBlockedBy(pid: number) {
  for (let attempt = 0; ; attempt += 1) {
    const { rows } = await pool!.query<{ waiting: number }>(
      "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))",
      [pid],
    );
    if (rows[0].waiting > 0) return;
    if (attempt > 250) throw new Error("Nothing ever waited.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describeDatabase("overdue profile deletion", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL ??= testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";

    dbHolder.current = integrationDb as never;
    ({ handleDeletionEmails } =
      await import("@/app/lib/profile_tasks/actions"));

    try {
      await integrationDb!
        .select({ id: pendingUserDeletions.id })
        .from(pendingUserDeletions)
        .limit(1);
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  beforeEach(() => {
    deleteClerkUserMock.mockReset();
    deleteClerkUserMock.mockResolvedValue({
      success: true,
      status: "deleted",
      message: "ok",
    });
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({
      data: { id: `re_${randomUUID()}` },
      error: null,
      headers: null,
    });
  });

  afterEach(async () => {
    if (createdClerkIds.length > 0) {
      // Deleted profiles leave their outbox row with a null user_id.
      await integrationDb!
        .delete(pendingUserDeletions)
        .where(inArray(pendingUserDeletions.clerkId, createdClerkIds));
      createdClerkIds.length = 0;
    }
    if (createdUserIds.length > 0) {
      const client = await pool!.connect();
      try {
        await client.query(
          "ALTER TABLE credit_ledger_entries DISABLE TRIGGER credit_ledger_entries_append_only",
        );
        await client.query(
          `DELETE FROM credit_ledger_entries WHERE user_id = ANY($1::int[])`,
          [createdUserIds],
        );
      } finally {
        await client.query(
          "ALTER TABLE credit_ledger_entries ENABLE TRIGGER credit_ledger_entries_append_only",
        );
        client.release();
      }
      // scheduled_tasks cascade with their profile.
      await integrationDb!
        .delete(users)
        .where(inArray(users.id, createdUserIds));
      createdUserIds.length = 0;
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("keeps credit holders and their Clerk accounts without starving the batch", async () => {
    const holders = [];
    for (let i = 0; i < BATCH_SIZE; i += 1) {
      const holder = await overdueProfile("1990-01-01T00:00:00Z");
      await grantCredits(holder.id);
      holders.push(holder);
    }
    // Newer than every holder, so it only makes the batch if they are left out.
    const deletable = await overdueProfile("1990-01-02T00:00:00Z");

    await handleDeletionEmails();

    for (const holder of holders) {
      expect(await userExists(holder.id)).toBe(true);
      // Still open: the profile was never completed, only kept.
      expect(await openTask(holder.taskId)).toEqual({ completedAt: null });
    }
    expect(await pendingRowsFor(holders.map((h) => h.clerkId))).toEqual([]);
    const clerkCalls = deleteClerkUserMock.mock.calls.map(([id]) => id);
    for (const holder of holders) {
      expect(clerkCalls).not.toContain(holder.clerkId);
    }

    expect(clerkCalls).toContain(deletable.clerkId);
    expect(await userExists(deletable.id)).toBe(false);
    expect(await pendingRowsFor([deletable.clerkId])).toEqual([
      expect.objectContaining({
        userId: null,
        clerkDeletedAt: expect.any(Date),
        localDeletedAt: expect.any(Date),
      }),
    ]);
  });

  it("leaves a profile alone when credits land while the run waits on its lock", async () => {
    const profile = await overdueProfile("1990-01-01T00:00:00Z");

    // A credit write takes the same user lock. Hold it so the run has already
    // scanned the profile as deletable by the time the grant commits.
    const writer = await pool!.connect();
    let run: Promise<unknown> | undefined;
    try {
      await writer.query("BEGIN");
      await writer.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [
        profile.id,
      ]);
      const {
        rows: [{ pid }],
      } = await writer.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");

      run = handleDeletionEmails();
      await waitUntilBlockedBy(pid);

      await grantCredits(profile.id, writer);
      await writer.query("COMMIT");
      await run;
    } catch (error) {
      await writer.query("ROLLBACK").catch(() => undefined);
      await run?.catch(() => undefined);
      throw error;
    } finally {
      writer.release();
    }

    expect(await userExists(profile.id)).toBe(true);
    expect(await openTask(profile.taskId)).toEqual({ completedAt: null });
    expect(await pendingRowsFor([profile.clerkId])).toEqual([]);
    expect(deleteClerkUserMock).not.toHaveBeenCalledWith(profile.clerkId);
  });
});
