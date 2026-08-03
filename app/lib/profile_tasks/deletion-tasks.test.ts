import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScheduledTaskWithProfile } from "@/app/lib/profile_tasks/definitions";

const transactionMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const deleteClerkUserMock = vi.hoisted(() => vi.fn());
const anonymizeMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
    update: updateMock,
  },
}));

vi.mock("@/app/lib/users/clerk", () => ({
  deleteClerkUser: deleteClerkUserMock,
}));

vi.mock("@/app/lib/programs/anonymization", () => ({
  anonymizeProgramPurchasesForUser: anonymizeMock,
}));

vi.mock("@/app/vendors/resend", () => ({
  sendEmail: sendEmailMock,
}));

// The real helper sleeps a second every ten records, which would dominate the
// run time here. The loop itself is what matters, so keep it and drop the wait.
vi.mock("@/app/lib/emails/helpers", () => ({
  queueEmails: async (
    entities: unknown[],
    callback: (entity: unknown) => Promise<void>,
  ) => {
    for (const entity of entities) await callback(entity);
  },
}));

import { handleDeletionEmails } from "@/app/lib/profile_tasks/actions";

type PendingRow = { id: number; clerkDeletedAt: Date | null };

let timeline: string[];
/** Every `.set(...)` payload written, in or out of a transaction. */
let writes: Record<string, unknown>[];
let findManyArgs: Record<string, unknown> | undefined;

function makeTask(overrides: {
  taskId: number;
  profileId: number;
  clerkId: string;
}): ScheduledTaskWithProfile {
  return {
    id: overrides.taskId,
    profileId: overrides.profileId,
    profile: {
      id: overrides.profileId,
      clerkId: overrides.clerkId,
      email: `user${overrides.profileId}@example.com`,
    },
  } as unknown as ScheduledTaskWithProfile;
}

function recordingUpdate() {
  return vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => {
      writes.push(values);
      return { where: vi.fn(async () => undefined) };
    }),
  }));
}

/**
 * First transaction: reads the bounded batch of overdue tasks, then per task
 * either finds an existing outbox row or inserts one. `lookups` is consumed in
 * task order.
 */
function claimTx(
  overdueTasks: ScheduledTaskWithProfile[],
  lookups: (PendingRow | undefined)[] = [],
  insertIds: number[] = [],
) {
  const pendingLookups = [...lookups];
  const pendingInserts = [...insertIds];

  return {
    query: {
      scheduledTasks: {
        findMany: vi.fn(async (args: Record<string, unknown>) => {
          findManyArgs = args;
          return overdueTasks;
        }),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => {
              const row = pendingLookups.shift();
              return row ? [row] : [];
            }),
          })),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [{ id: pendingInserts.shift() ?? 0 }]),
      })),
    })),
  };
}

/** Per-profile transaction: anonymize, delete the user, stamp the outbox. */
function deleteTx(deletedRows: unknown[]) {
  return {
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => deletedRows),
      })),
    })),
    update: recordingUpdate(),
  };
}

function runTransactions(...txObjects: unknown[]) {
  const queue = [...txObjects];
  transactionMock.mockImplementation(
    async (callback: (tx: unknown) => unknown) => {
      const tx = queue.shift();
      const label =
        queue.length === txObjects.length - 1 ? "claim-tx" : "delete-tx";
      timeline.push(`${label}:start`);
      const result = await callback(tx);
      timeline.push(`${label}:end`);
      return result;
    },
  );
}

const deletedOk = { success: true, status: "deleted", message: "ok" };

describe("handleDeletionEmails", () => {
  beforeEach(() => {
    timeline = [];
    writes = [];
    findManyArgs = undefined;
    transactionMock.mockReset();
    updateMock.mockReset();
    deleteClerkUserMock.mockReset();
    anonymizeMock.mockReset();
    sendEmailMock.mockReset();

    anonymizeMock.mockResolvedValue(undefined);
    sendEmailMock.mockResolvedValue({ data: { id: "email_1" }, error: null });
    updateMock.mockImplementation(recordingUpdate());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("deletes the profile and reports the task once Clerk confirms", async () => {
    const task = makeTask({ taskId: 7, profileId: 12, clerkId: "user_abc" });
    deleteClerkUserMock.mockResolvedValue(deletedOk);
    runTransactions(claimTx([task], [undefined], [55]), deleteTx([{ id: 12 }]));

    const result = await handleDeletionEmails();

    expect(deleteClerkUserMock).toHaveBeenCalledWith("user_abc");
    expect(anonymizeMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([task]);
    // The task row itself is removed by the ON DELETE CASCADE on profile_id;
    // closing the outbox entry is what marks the work done.
    expect(writes).toContainEqual(
      expect.objectContaining({ localDeletedAt: expect.any(Date) }),
    );
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("treats already_deleted as success and still removes the profile", async () => {
    const task = makeTask({ taskId: 8, profileId: 13, clerkId: "user_gone" });
    deleteClerkUserMock.mockResolvedValue({
      success: true,
      status: "already_deleted",
      message: "Usuario no encontrado",
    });
    runTransactions(claimTx([task], [undefined], [56]), deleteTx([{ id: 13 }]));

    const result = await handleDeletionEmails();

    expect(result).toEqual([task]);
    expect(writes).toContainEqual(
      expect.objectContaining({ localDeletedAt: expect.any(Date) }),
    );
  });

  it("keeps the profile and records the error when Clerk rejects the delete", async () => {
    const task = makeTask({ taskId: 9, profileId: 14, clerkId: "user_bad" });
    deleteClerkUserMock.mockResolvedValue({
      success: false,
      status: "request_failed",
      message: "Error al eliminar la cuenta.",
    });
    runTransactions(claimTx([task], [undefined], [57]));

    const result = await handleDeletionEmails();

    // Only the claim transaction ran, so the profile row was never deleted.
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(anonymizeMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(writes).toContainEqual(
      expect.objectContaining({
        lastError: "clerk_delete_failed: Error al eliminar la cuenta.",
      }),
    );
    // Nothing closed the outbox entry, so the next run retries this profile.
    expect(writes.some((write) => "localDeletedAt" in write)).toBe(false);
  });

  it("calls Clerk only after the claiming transaction has committed", async () => {
    const task = makeTask({ taskId: 10, profileId: 15, clerkId: "user_order" });
    deleteClerkUserMock.mockImplementation(async () => {
      timeline.push("clerk");
      return deletedOk;
    });
    runTransactions(claimTx([task], [undefined], [58]), deleteTx([{ id: 15 }]));

    await handleDeletionEmails();

    expect(timeline).toEqual([
      "claim-tx:start",
      "claim-tx:end",
      "clerk",
      "delete-tx:start",
      "delete-tx:end",
    ]);
  });

  it("skips the Clerk call when the outbox already recorded the deletion", async () => {
    const task = makeTask({
      taskId: 11,
      profileId: 16,
      clerkId: "user_resume",
    });
    runTransactions(
      claimTx([task], [{ id: 59, clerkDeletedAt: new Date("2026-08-01") }]),
      deleteTx([{ id: 16 }]),
    );

    const result = await handleDeletionEmails();

    expect(deleteClerkUserMock).not.toHaveBeenCalled();
    expect(result).toEqual([task]);
  });

  it("does nothing when no task is overdue", async () => {
    runTransactions(claimTx([]));

    const result = await handleDeletionEmails();

    expect(result).toEqual([]);
    expect(deleteClerkUserMock).not.toHaveBeenCalled();
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it("claims a bounded batch so one run cannot outgrow its budget", async () => {
    runTransactions(claimTx([]));

    await handleDeletionEmails();

    expect(findManyArgs).toMatchObject({ limit: 25 });
  });

  it("stops at the time budget and leaves the rest queued for the next run", async () => {
    const first = makeTask({
      taskId: 20,
      profileId: 30,
      clerkId: "user_first",
    });
    const second = makeTask({
      taskId: 21,
      profileId: 31,
      clerkId: "user_second",
    });

    // Hold the clock still until one deletion is done, then jump past the
    // deadline so the second iteration bails out.
    let clerkCalls = 0;
    deleteClerkUserMock.mockImplementation(async () => {
      clerkCalls += 1;
      return deletedOk;
    });
    vi.spyOn(Date, "now").mockImplementation(() =>
      clerkCalls >= 1 ? 10_000_000 : 0,
    );

    runTransactions(
      claimTx([first, second], [undefined, undefined], [60, 61]),
      deleteTx([{ id: 30 }]),
    );

    const result = await handleDeletionEmails();

    expect(result).toEqual([first]);
    expect(deleteClerkUserMock).toHaveBeenCalledTimes(1);
    expect(deleteClerkUserMock).toHaveBeenCalledWith("user_first");
  });

  it("counts the claiming transaction against the run budget", async () => {
    const task = makeTask({ taskId: 40, profileId: 50, clerkId: "user_slow" });
    deleteClerkUserMock.mockResolvedValue(deletedOk);

    // A claim that burns more than the whole budget must leave nothing for the
    // Clerk phase; a deadline started after the claim would happily proceed.
    let claimCommitted = false;
    vi.spyOn(Date, "now").mockImplementation(() =>
      claimCommitted ? 61_000 : 0,
    );
    const tx = claimTx([task], [undefined], [80]);
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) => {
        const result = await callback(tx);
        claimCommitted = true;
        return result;
      },
    );

    const result = await handleDeletionEmails();

    expect(deleteClerkUserMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("gives up on a hung Clerk call and records it as a failure", async () => {
    vi.useFakeTimers();
    const task = makeTask({ taskId: 30, profileId: 40, clerkId: "user_hang" });
    // Never settles: only the timeout can resolve the race.
    deleteClerkUserMock.mockImplementation(() => new Promise(() => {}));
    runTransactions(claimTx([task], [undefined], [70]));

    const pending = handleDeletionEmails();
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;

    expect(result).toEqual([]);
    // Never reached the delete transaction, so the profile survives.
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(writes).toContainEqual(
      expect.objectContaining({
        lastError: expect.stringContaining("timed out"),
      }),
    );
  });
});
