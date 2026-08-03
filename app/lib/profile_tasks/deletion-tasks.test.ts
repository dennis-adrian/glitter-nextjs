import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScheduledTaskWithProfile } from "@/app/lib/profile_tasks/definitions";

const transactionMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const deleteClerkUserMock = vi.hoisted(() => vi.fn());
const anonymizeMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
    update: updateMock,
    select: selectMock,
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

type PendingRow = {
  id: number;
  clerkDeletedAt: Date | null;
  attempts: number;
};

let timeline: string[];
/** Every `.set(...)` payload written, in or out of a transaction. */
let writes: Record<string, unknown>[];
/** Row cap passed to the eligible-task scan. */
let claimLimit: number | undefined;
/** Outbox rows the email drain should find. */
let owedEmails: { pendingId: number; recipientEmail: string | null }[];
let eligibleOrdered: boolean;

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
    // Eligibility scan: excludes backing-off / capped rows, oldest first.
    selectDistinct: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => {
              eligibleOrdered = true;
              return {
                limit: vi.fn(async (rows: number) => {
                  claimLimit = rows;
                  return overdueTasks.map((task) => ({
                    taskId: task.id,
                    dueDate: new Date(0),
                  }));
                }),
              };
            }),
          })),
        })),
      })),
    })),
    query: {
      scheduledTasks: {
        findMany: vi.fn(async () => overdueTasks),
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

/** Per-profile transaction whose delete blows up, to exercise the catch. */
function failingDeleteTx(error: unknown) {
  return {
    delete: vi.fn(() => {
      throw error;
    }),
    update: recordingUpdate(),
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
    claimLimit = undefined;
    eligibleOrdered = false;
    owedEmails = [];
    transactionMock.mockReset();
    updateMock.mockReset();
    deleteClerkUserMock.mockReset();
    anonymizeMock.mockReset();
    sendEmailMock.mockReset();

    anonymizeMock.mockResolvedValue(undefined);
    sendEmailMock.mockResolvedValue({ data: { id: "email_1" }, error: null });
    updateMock.mockImplementation(recordingUpdate());
    // db.select(...)...limit() drives the deletion-email drain.
    selectMock.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => owedEmails),
          })),
        })),
      })),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("deletes the profile and reports the task once Clerk confirms", async () => {
    const task = makeTask({ taskId: 7, profileId: 12, clerkId: "user_abc" });
    deleteClerkUserMock.mockResolvedValue(deletedOk);
    owedEmails = [{ pendingId: 55, recipientEmail: "user12@example.com" }];
    runTransactions(claimTx([task], [undefined], [55]), deleteTx([{ id: 12 }]));

    const result = await handleDeletionEmails();

    expect(deleteClerkUserMock).toHaveBeenCalledWith("user_abc");
    expect(anonymizeMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([task]);
    // The task row itself is removed by the ON DELETE CASCADE on profile_id;
    // closing the outbox entry is what marks the work done. The address is
    // carried over because the profile it came from is gone.
    expect(writes).toContainEqual(
      expect.objectContaining({
        localDeletedAt: expect.any(Date),
        recipientEmail: "user12@example.com",
      }),
    );
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("stamps emailSentAt and clears the address once the notice sends", async () => {
    owedEmails = [{ pendingId: 55, recipientEmail: "gone@example.com" }];
    runTransactions(claimTx([]));

    await handleDeletionEmails();

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["gone@example.com"] }),
    );
    expect(writes).toContainEqual(
      expect.objectContaining({
        emailSentAt: expect.any(Date),
        recipientEmail: null,
      }),
    );
  });

  it("leaves the marker unset when the send fails, so a later run retries", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    owedEmails = [{ pendingId: 56, recipientEmail: "retry@example.com" }];
    sendEmailMock.mockResolvedValue({ data: null, error: { message: "550" } });
    runTransactions(claimTx([]));

    await handleDeletionEmails();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(writes.some((write) => "emailSentAt" in write)).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("drains notices owed by earlier runs even with nothing new to delete", async () => {
    owedEmails = [
      { pendingId: 57, recipientEmail: "old1@example.com" },
      { pendingId: 58, recipientEmail: "old2@example.com" },
    ];
    runTransactions(claimTx([]));

    const result = await handleDeletionEmails();

    // No task was claimed this run, but the backlog still goes out.
    expect(result).toEqual([]);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(writes.filter((write) => "emailSentAt" in write)).toHaveLength(2);
  });

  it("skips the email drain once the run budget is spent", async () => {
    owedEmails = [{ pendingId: 59, recipientEmail: "late@example.com" }];
    runTransactions(claimTx([]));
    let claimDone = false;
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) => {
        const out = await callback(claimTx([]));
        claimDone = true;
        return out;
      },
    );
    vi.spyOn(Date, "now").mockImplementation(() =>
      claimDone ? 10_000_000 : 0,
    );

    await handleDeletionEmails();

    expect(sendEmailMock).not.toHaveBeenCalled();
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
      claimTx(
        [task],
        [{ id: 59, clerkDeletedAt: new Date("2026-08-01"), attempts: 0 }],
      ),
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

  it("claims a bounded batch, oldest first, so one run cannot outgrow its budget", async () => {
    runTransactions(claimTx([]));

    await handleDeletionEmails();

    expect(claimLimit).toBe(25);
    expect(eligibleOrdered).toBe(true);
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

  it("increments attempts and backs off when Clerk fails", async () => {
    const task = makeTask({ taskId: 50, profileId: 60, clerkId: "user_retry" });
    deleteClerkUserMock.mockResolvedValue({
      success: false,
      status: "request_failed",
      message: "boom",
    });
    // Second attempt on a row that already failed once.
    runTransactions(
      claimTx([task], [{ id: 90, clerkDeletedAt: null, attempts: 1 }]),
    );

    const before = Date.now();
    await handleDeletionEmails();

    const failure = writes.find((write) => "attempts" in write);
    expect(failure).toBeDefined();
    expect(failure!.attempts).toBe(2);
    expect(failure!.lastError).toBe("clerk_delete_failed: boom");
    // 60s * 2^(2-1) = 120s of backoff before this row is eligible again.
    expect((failure!.nextAttemptAt as Date).getTime()).toBeGreaterThanOrEqual(
      before + 120_000,
    );
  });

  it("keeps counting up to the cap so an unfixable profile stops being claimed", async () => {
    const task = makeTask({ taskId: 51, profileId: 61, clerkId: "user_stuck" });
    deleteClerkUserMock.mockResolvedValue({
      success: false,
      status: "request_failed",
      message: "still broken",
    });
    // One short of MAX_DELETION_ATTEMPTS (5).
    runTransactions(
      claimTx([task], [{ id: 91, clerkDeletedAt: null, attempts: 4 }]),
    );

    await handleDeletionEmails();

    const failure = writes.find((write) => "attempts" in write);
    // At 5 the claim query stops selecting the row, and lastError survives for
    // an operator to read.
    expect(failure!.attempts).toBe(5);
    expect(failure!.lastError).toBe("clerk_delete_failed: still broken");
  });

  it("resets the retry counter once Clerk confirms the deletion", async () => {
    const task = makeTask({ taskId: 52, profileId: 62, clerkId: "user_ok" });
    deleteClerkUserMock.mockResolvedValue(deletedOk);
    runTransactions(
      claimTx([task], [{ id: 92, clerkDeletedAt: null, attempts: 3 }]),
      deleteTx([{ id: 62 }]),
    );

    await handleDeletionEmails();

    expect(writes).toContainEqual(
      expect.objectContaining({
        attempts: 0,
        clerkDeletedAt: expect.any(Date),
      }),
    );
  });

  it("persists only schema identifiers when a local delete fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const task = makeTask({ taskId: 70, profileId: 80, clerkId: "user_pg" });
    // A driver error of the shape node-postgres actually throws: the message
    // quotes the offending row.
    const pgError = Object.assign(
      new Error(
        "update or delete violates foreign key constraint Key (email)=(leak@example.com) is still referenced",
      ),
      { code: "23503", constraint: "invoices_user_id_users_id_fk" },
    );
    deleteClerkUserMock.mockResolvedValue(deletedOk);
    runTransactions(
      claimTx([task], [undefined], [95]),
      failingDeleteTx(pgError),
    );

    await handleDeletionEmails();

    // The successful Clerk update also carries attempts, so match on the
    // failure's non-null lastError.
    const failure = writes.find((write) => typeof write.lastError === "string");
    const persisted = failure!.lastError as string;
    expect(persisted).toContain("local_delete_failed");
    expect(persisted).toContain("sqlstate=23503");
    expect(persisted).toContain("constraint=invoices_user_id_users_id_fk");
    expect(persisted).not.toContain("leak@example.com");
    expect(persisted.length).toBeLessThanOrEqual(120);
    // The unredacted error still reaches the logs.
    expect(consoleSpy).toHaveBeenCalledWith(
      "Error deleting profile locally",
      pgError,
    );
  });

  it("truncates an oversized detail to the persisted bound", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const task = makeTask({ taskId: 72, profileId: 82, clerkId: "user_long" });
    const pgError = Object.assign(new Error("boom"), {
      code: "23503",
      constraint: `c_${"x".repeat(300)}`,
    });
    deleteClerkUserMock.mockResolvedValue(deletedOk);
    runTransactions(
      claimTx([task], [undefined], [97]),
      failingDeleteTx(pgError),
    );

    await handleDeletionEmails();

    const failure = writes.find((write) => typeof write.lastError === "string");
    expect((failure!.lastError as string).length).toBe(120);
  });

  it("falls back to the error type when there is no driver code", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const task = makeTask({ taskId: 71, profileId: 81, clerkId: "user_plain" });
    deleteClerkUserMock.mockResolvedValue(deletedOk);
    runTransactions(
      claimTx([task], [undefined], [96]),
      failingDeleteTx(
        new TypeError("cannot read property of undefined at row 42"),
      ),
    );

    await handleDeletionEmails();

    const failure = writes.find((write) => typeof write.lastError === "string");
    expect(failure!.lastError).toBe("local_delete_failed type=TypeError");
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
