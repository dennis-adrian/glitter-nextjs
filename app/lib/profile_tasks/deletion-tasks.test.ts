import { asc, desc } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScheduledTaskWithProfile } from "@/app/lib/profile_tasks/definitions";
import { scheduledTasks } from "@/db/schema";

const transactionMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const finalizeMock = vi.hoisted(() => vi.fn());
const releaseMock = vi.hoisted(() => vi.fn());
const noteErrorMock = vi.hoisted(() => vi.fn());
const blockerMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
    update: updateMock,
    select: selectMock,
  },
}));

// The Clerk call and the local delete live in the shared core, tested against
// a real database in app/lib/users/deletion.integration.test.ts. Here only the
// cron's own decisions are under test: what it claims, how it reads each
// outcome, its budget and its notices.
vi.mock("@/app/lib/users/profile-deletion", () => ({
  finalizeProfileDeletion: finalizeMock,
  releaseRefusedDeletion: releaseMock,
  noteDeletionError: noteErrorMock,
  UNCONFIRMED_ATTEMPT_SETTLES_AFTER_MS: 5 * 60_000,
}));

vi.mock("@/app/lib/users/deletion-blockers", () => ({
  findProfileDeletionBlocker: blockerMock,
}));

// The payment reminder's in-app copy; these tests never reach it, and the
// real modules read the environment on import.
vi.mock("@/app/lib/notifications/notify", () => ({
  notify: vi.fn(),
}));
vi.mock("@/app/lib/notifications/deliveries", () => ({
  scheduleNotificationDeliveries: vi.fn(),
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
let owedEmails: {
  pendingId: number;
  recipientEmail: string | null;
  attempts?: number;
}[];
/** What the eligible-task scan was ordered by. */
let eligibleOrder: unknown;
/** Rows locked FOR UPDATE or inserted in the claim, in call order. */
let lockedForUpdate: string[];

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
 * The claiming transaction: reads the bounded batch of overdue tasks, then per
 * task either finds an existing outbox row or inserts one. `lookups` is
 * consumed in task order.
 */
function claimTx(
  overdueTasks: ScheduledTaskWithProfile[],
  lookups: (PendingRow | undefined)[] = [],
  insertIds: number[] = [],
  /** Per task, whether the user row still exists when the lock is taken. */
  userStillPresent: boolean[] = [],
) {
  const pendingLookups = [...lookups];
  const pendingInserts = [...insertIds];
  const userLocks = [...userStillPresent];

  return {
    // Eligibility scan: excludes backing-off / capped rows, oldest first.
    selectDistinct: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn((order: unknown) => {
              eligibleOrder = order;
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
          // user row lock: .limit(1).for("update")
          limit: vi.fn(() => ({
            for: vi.fn(async (mode: string) => {
              lockedForUpdate.push(`users:${mode}`);
              return userLocks.shift() === false ? [] : [{ id: 1 }];
            }),
          })),
          // outbox lookup: .orderBy(...).limit(1).for("update")
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              for: vi.fn(async (mode: string) => {
                lockedForUpdate.push(`pending:${mode}`);
                const row = pendingLookups.shift();
                return row ? [row] : [];
              }),
            })),
          })),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => {
          lockedForUpdate.push("pending:insert");
          return [{ id: pendingInserts.shift() ?? 0 }];
        }),
      })),
    })),
    // Closing the task of a profile that has to stay.
    update: recordingUpdate(),
  };
}

/** The cron opens one transaction of its own: the claim. */
function runClaim(claim: unknown) {
  transactionMock.mockImplementation(
    async (callback: (tx: unknown) => unknown) => {
      timeline.push("claim-tx:start");
      const result = await callback(claim);
      timeline.push("claim-tx:end");
      return result;
    },
  );
}

const closedTask = { ranAfterDueDate: true, updatedAt: expect.any(Date) };

describe("handleDeletionEmails", () => {
  beforeEach(() => {
    timeline = [];
    writes = [];
    claimLimit = undefined;
    eligibleOrder = undefined;
    lockedForUpdate = [];
    owedEmails = [];
    transactionMock.mockReset();
    updateMock.mockReset();
    finalizeMock.mockReset();
    releaseMock.mockReset();
    noteErrorMock.mockReset();
    blockerMock.mockReset();
    sendEmailMock.mockReset();

    finalizeMock.mockImplementation(async () => {
      timeline.push("finalize");
      return { kind: "deleted" };
    });
    blockerMock.mockResolvedValue(null);
    noteErrorMock.mockImplementation(
      async (pendingId: number, lastError: string, extra = {}) => {
        writes.push({ pendingId, lastError, ...extra });
      },
    );
    sendEmailMock.mockResolvedValue({ data: { id: "email_1" }, error: null });
    updateMock.mockImplementation(recordingUpdate());
    // db.select(...)...limit() drives the deletion-email drain.
    selectMock.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () =>
              owedEmails.map((row) => ({ attempts: 0, ...row })),
            ),
          })),
        })),
      })),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("deletes the profile through the shared core and reports the task", async () => {
    const task = makeTask({ taskId: 7, profileId: 12, clerkId: "user_abc" });
    owedEmails = [{ pendingId: 55, recipientEmail: "user12@example.com" }];
    runClaim(claimTx([task], [undefined], [55]));

    const result = await handleDeletionEmails();

    expect(finalizeMock).toHaveBeenCalledTimes(1);
    const input = finalizeMock.mock.calls[0][0];
    expect(input).toMatchObject({
      profileId: 12,
      pendingId: 55,
      clerkId: "user_abc",
    });
    // Bounded by the cron's own Clerk timeout.
    expect(input.clerkBudgetMs).toBeGreaterThan(0);
    expect(input.clerkBudgetMs).toBeLessThanOrEqual(10_000);
    // The address is carried over because the profile it came from is gone,
    // and the notice phase starts from a clean retry budget.
    const now = new Date();
    expect(input.deletedPendingValues(now)).toEqual({
      recipientEmail: "user12@example.com",
      attempts: 0,
      nextAttemptAt: now,
    });
    // Cleanup (posts, notices) is the core's own, the same for every path.
    expect(input).not.toHaveProperty("beforeUserDelete");
    expect(result).toEqual([task]);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("starts the delete only after the claiming transaction has committed", async () => {
    const task = makeTask({ taskId: 10, profileId: 15, clerkId: "user_order" });
    runClaim(claimTx([task], [undefined], [58]));

    await handleDeletionEmails();

    expect(timeline).toEqual(["claim-tx:start", "claim-tx:end", "finalize"]);
  });

  it("keeps the profile and records the error when Clerk keeps the login", async () => {
    const task = makeTask({ taskId: 9, profileId: 14, clerkId: "user_bad" });
    finalizeMock.mockResolvedValue({
      kind: "clerk_not_deleted",
      message: "clerk_delete_failed: Error al eliminar la cuenta.",
    });
    runClaim(claimTx([task], [undefined], [57]));

    const result = await handleDeletionEmails();

    expect(result).toEqual([]);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(writes).toContainEqual(
      expect.objectContaining({
        attempts: 1,
        lastError: "clerk_delete_failed: Error al eliminar la cuenta.",
      }),
    );
  });

  it("retries an unconfirmed Clerk outcome on a later run", async () => {
    const task = makeTask({ taskId: 12, profileId: 17, clerkId: "user_unk" });
    finalizeMock.mockResolvedValue({
      kind: "clerk_unknown",
      message: "clerk_delete_failed: timed out",
    });
    runClaim(claimTx([task], [{ id: 62, clerkDeletedAt: null, attempts: 2 }]));

    const result = await handleDeletionEmails();

    expect(result).toEqual([]);
    expect(writes).toContainEqual(
      expect.objectContaining({
        attempts: 3,
        lastError: "clerk_delete_failed: timed out",
      }),
    );
  });

  it("never parks an unconfirmed Clerk outcome, so a later run can still finish it", async () => {
    const task = makeTask({ taskId: 11, profileId: 16, clerkId: "user_late" });
    finalizeMock.mockResolvedValue({
      kind: "clerk_unknown",
      message: "clerk_delete_failed: timed out",
    });
    // One short of the cap. Counting this as the fifth failure would drop the
    // row from the claim while Clerk may still apply the request, leaving a
    // profile with no login that no run comes back to.
    runClaim(claimTx([task], [{ id: 61, clerkDeletedAt: null, attempts: 4 }]));

    await handleDeletionEmails();

    expect(writes).toContainEqual(
      expect.objectContaining({
        attempts: 4,
        lastError: "clerk_delete_failed: timed out",
      }),
    );
  });

  it("leaves a deletion another attempt has taken over alone", async () => {
    const task = makeTask({ taskId: 13, profileId: 18, clerkId: "user_race" });
    finalizeMock.mockResolvedValue({ kind: "conflict" });
    runClaim(claimTx([task], [undefined], [63]));

    const result = await handleDeletionEmails();

    expect(result).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("increments attempts and backs off when Clerk fails", async () => {
    const task = makeTask({ taskId: 50, profileId: 60, clerkId: "user_retry" });
    finalizeMock.mockResolvedValue({
      kind: "clerk_not_deleted",
      message: "clerk_delete_failed: boom",
    });
    // Second attempt on a row that already failed once.
    runClaim(claimTx([task], [{ id: 90, clerkDeletedAt: null, attempts: 1 }]));

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
    finalizeMock.mockResolvedValue({
      kind: "clerk_not_deleted",
      message: "clerk_delete_failed: still broken",
    });
    // One short of MAX_DELETION_ATTEMPTS (5).
    runClaim(claimTx([task], [{ id: 91, clerkDeletedAt: null, attempts: 4 }]));

    await handleDeletionEmails();

    const failure = writes.find((write) => "attempts" in write);
    // At 5 the claim query stops selecting the row, and lastError survives for
    // an operator to read.
    expect(failure!.attempts).toBe(5);
    expect(failure!.lastError).toBe("clerk_delete_failed: still broken");
  });

  describe("a profile something keeps (an infraction, credits, a reservation)", () => {
    it("is never queued, so Clerk is never asked, and its task is closed", async () => {
      const task = makeTask({ taskId: 14, profileId: 19, clerkId: "user_k" });
      blockerMock.mockResolvedValue("infractions");
      runClaim(claimTx([task], [undefined], [64]));

      const result = await handleDeletionEmails();

      expect(blockerMock).toHaveBeenCalledWith(expect.anything(), 19);
      expect(finalizeMock).not.toHaveBeenCalled();
      expect(releaseMock).not.toHaveBeenCalled();
      // No outbox row was created for it, and the task stops being claimed.
      expect(lockedForUpdate).toEqual(["users:update", "pending:update"]);
      expect(writes).toEqual([closedTask]);
      expect(result).toEqual([]);
    });

    it("on a retry, gives the account back when its login is certainly intact", async () => {
      const task = makeTask({ taskId: 15, profileId: 20, clerkId: "user_r" });
      blockerMock.mockResolvedValue("credit_history");
      releaseMock.mockResolvedValue("intact");
      runClaim(
        claimTx([task], [{ id: 65, clerkDeletedAt: null, attempts: 1 }]),
      );

      await handleDeletionEmails();

      expect(finalizeMock).not.toHaveBeenCalled();
      expect(releaseMock).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: 20,
          pendingId: 65,
          clerkId: "user_r",
        }),
      );
      expect(writes).toEqual([closedTask]);
    });

    it("on a retry, checks again later when Clerk cannot confirm the login, without spending attempts", async () => {
      const task = makeTask({ taskId: 18, profileId: 23, clerkId: "user_q" });
      blockerMock.mockResolvedValue("participations");
      releaseMock.mockResolvedValue("unknown");
      // One short of the cap: counting this as a failed deletion would drop
      // the still-pending account out of the claim for good.
      runClaim(
        claimTx([task], [{ id: 68, clerkDeletedAt: null, attempts: 4 }]),
      );

      const before = Date.now();
      await handleDeletionEmails();

      expect(writes).toEqual([
        {
          lastError: "blocked_login_unconfirmed: participations",
          nextAttemptAt: expect.any(Date),
          updatedAt: expect.any(Date),
        },
      ]);
      // Once an unconfirmed request can no longer land.
      expect(
        (writes[0].nextAttemptAt as Date).getTime(),
      ).toBeGreaterThanOrEqual(before + 5 * 60_000);
    });

    it("is parked for an operator when its login is already gone", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const task = makeTask({ taskId: 16, profileId: 21, clerkId: "user_g" });
      finalizeMock.mockResolvedValue({
        kind: "blocked",
        blocker: "sanctions",
        loginAlreadyGone: true,
      });
      runClaim(
        claimTx([task], [{ id: 66, clerkDeletedAt: new Date(), attempts: 0 }]),
      );

      await handleDeletionEmails();

      // The claim leaves this case to the delete step, which holds the lock.
      expect(blockerMock).not.toHaveBeenCalled();
      // Not asked again: the login is known to be gone.
      expect(releaseMock).not.toHaveBeenCalled();
      expect(writes).toEqual([
        {
          pendingId: 66,
          lastError: "blocked_after_login_removed: sanctions",
          attempts: 5,
        },
      ]);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Profile kept without a login: deletion blocked",
        { profileId: 21, blocker: "sanctions" },
      );
    });

    it("leaves a deletion another run finished meanwhile alone", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const task = makeTask({ taskId: 19, profileId: 24, clerkId: "user_f" });
      blockerMock.mockResolvedValue("credit_history");
      releaseMock.mockResolvedValue("deleted");
      runClaim(
        claimTx([task], [{ id: 69, clerkDeletedAt: null, attempts: 1 }]),
      );

      await handleDeletionEmails();

      // Not parked: its notice still has to go out.
      expect(writes).toEqual([]);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("settles a blocker that appeared after the claim through the release", async () => {
      const task = makeTask({ taskId: 17, profileId: 22, clerkId: "user_u" });
      finalizeMock.mockResolvedValue({
        kind: "blocked",
        blocker: "participations",
        loginAlreadyGone: false,
      });
      releaseMock.mockResolvedValue("intact");
      runClaim(claimTx([task], [undefined], [67]));

      await handleDeletionEmails();

      expect(releaseMock).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: 22, pendingId: 67 }),
      );
      expect(writes).toEqual([closedTask]);
    });
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
    finalizeMock.mockResolvedValue({
      kind: "local_failed",
      error: pgError,
      loginGone: true,
      loginRemovedNow: true,
    });
    runClaim(claimTx([task], [undefined], [95]));

    await handleDeletionEmails();

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
    finalizeMock.mockResolvedValue({
      kind: "local_failed",
      error: Object.assign(new Error("boom"), {
        code: "23503",
        constraint: `c_${"x".repeat(300)}`,
      }),
      loginGone: true,
      loginRemovedNow: true,
    });
    runClaim(claimTx([task], [undefined], [97]));

    await handleDeletionEmails();

    const failure = writes.find((write) => typeof write.lastError === "string");
    expect((failure!.lastError as string).length).toBe(120);
  });

  it("falls back to the error type when there is no driver code", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const task = makeTask({ taskId: 71, profileId: 81, clerkId: "user_plain" });
    finalizeMock.mockResolvedValue({
      kind: "local_failed",
      error: new TypeError("cannot read property of undefined at row 42"),
      loginGone: true,
      loginRemovedNow: true,
    });
    runClaim(claimTx([task], [undefined], [96]));

    await handleDeletionEmails();

    const failure = writes.find((write) => typeof write.lastError === "string");
    expect(failure!.lastError).toBe("local_delete_failed type=TypeError");
  });

  it("restarts the retry count when the local delete fails after the login went", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const task = makeTask({ taskId: 60, profileId: 70, clerkId: "user_reset" });
    finalizeMock.mockResolvedValue({
      kind: "local_failed",
      error: new Error("nope"),
      loginGone: true,
      loginRemovedNow: true,
    });
    runClaim(claimTx([task], [{ id: 99, clerkDeletedAt: null, attempts: 3 }]));

    await handleDeletionEmails();

    const failure = writes.find((write) => typeof write.lastError === "string");
    // The Clerk step is done, so this is the first failure of the local
    // delete, not the fourth try: the claimed count would burn the budget.
    expect(failure!.attempts).toBe(1);
  });

  it("keeps counting when the login went in an earlier run, so the delete reaches the cap", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const task = makeTask({ taskId: 62, profileId: 72, clerkId: "user_again" });
    finalizeMock.mockResolvedValue({
      kind: "local_failed",
      error: new Error("still failing"),
      loginGone: true,
      loginRemovedNow: false,
    });
    runClaim(
      claimTx([task], [{ id: 97, clerkDeletedAt: new Date(), attempts: 4 }]),
    );

    await handleDeletionEmails();

    const failure = writes.find((write) => typeof write.lastError === "string");
    expect(failure!.attempts).toBe(5);
  });

  it("keeps counting from the claimed attempts when the login is still there", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const task = makeTask({ taskId: 61, profileId: 71, clerkId: "user_keep" });
    finalizeMock.mockResolvedValue({
      kind: "local_failed",
      error: new Error("before clerk"),
      loginGone: false,
      loginRemovedNow: false,
    });
    runClaim(claimTx([task], [{ id: 98, clerkDeletedAt: null, attempts: 2 }]));

    await handleDeletionEmails();

    const failure = writes.find((write) => typeof write.lastError === "string");
    expect(failure!.attempts).toBe(3);
  });

  it("stamps emailSentAt and clears the address once the notice sends", async () => {
    owedEmails = [{ pendingId: 55, recipientEmail: "gone@example.com" }];
    runClaim(claimTx([]));

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
    runClaim(claimTx([]));

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
    runClaim(claimTx([]));

    const result = await handleDeletionEmails();

    // No task was claimed this run, but the backlog still goes out.
    expect(result).toEqual([]);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(writes.filter((write) => "emailSentAt" in write)).toHaveLength(2);
  });

  it("skips the email drain once the run budget is spent", async () => {
    owedEmails = [{ pendingId: 59, recipientEmail: "late@example.com" }];
    runClaim(claimTx([]));
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

  it("increments attempts and backs off when the notice fails to send", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    owedEmails = [
      { pendingId: 60, recipientEmail: "bounce@example.com", attempts: 1 },
    ];
    sendEmailMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", statusCode: 422 },
    });
    runClaim(claimTx([]));

    const before = Date.now();
    await handleDeletionEmails();

    const failure = writes.find((write) => typeof write.lastError === "string");
    expect(failure!.attempts).toBe(2);
    expect(failure!.lastError).toBe(
      "email_send_failed name=validation_error status=422",
    );
    // 60s * 2^(2-1) before this address is tried again.
    expect((failure!.nextAttemptAt as Date).getTime()).toBeGreaterThanOrEqual(
      before + 120_000,
    );
    // Not yet exhausted, so the address is still needed.
    expect(failure).not.toHaveProperty("recipientEmail");
  });

  it("drops the retained address once the notice hits the attempt cap", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    owedEmails = [
      { pendingId: 61, recipientEmail: "dead@example.com", attempts: 4 },
    ];
    sendEmailMock.mockResolvedValue({
      data: null,
      error: { name: "server_error", statusCode: 500 },
    });
    runClaim(claimTx([]));

    await handleDeletionEmails();

    const failure = writes.find((write) => typeof write.lastError === "string");
    expect(failure!.attempts).toBe(5);
    // Stops the retries and releases the last held piece of the profile.
    expect(failure!.recipientEmail).toBeNull();
  });

  it("claims a bounded batch, oldest first, so one run cannot outgrow its budget", async () => {
    runClaim(claimTx([]));

    await handleDeletionEmails();

    expect(claimLimit).toBe(25);
    // Oldest due date first, specifically: newest first would starve the
    // longest-waiting profiles behind a steady stream of new ones.
    expect(eligibleOrder).toEqual(asc(scheduledTasks.dueDate));
    expect(eligibleOrder).not.toEqual(desc(scheduledTasks.dueDate));
  });

  it("does nothing when no task is overdue", async () => {
    runClaim(claimTx([]));

    const result = await handleDeletionEmails();

    expect(result).toEqual([]);
    expect(finalizeMock).not.toHaveBeenCalled();
    expect(transactionMock).toHaveBeenCalledTimes(1);
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
    let deletions = 0;
    finalizeMock.mockImplementation(async () => {
      deletions += 1;
      return { kind: "deleted" };
    });
    vi.spyOn(Date, "now").mockImplementation(() =>
      deletions >= 1 ? 10_000_000 : 0,
    );

    runClaim(claimTx([first, second], [undefined, undefined], [60, 61]));

    const result = await handleDeletionEmails();

    expect(result).toEqual([first]);
    expect(finalizeMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock).toHaveBeenCalledWith(
      expect.objectContaining({ clerkId: "user_first" }),
    );
  });

  it("hands the run deadline to the delete, to be checked once the lock is held", async () => {
    const task = makeTask({ taskId: 30, profileId: 40, clerkId: "user_late" });
    // 3s of the 60s run left when the profile comes up. The budget is not
    // worked out here: waiting for the row lock could use it up, so the core
    // measures what is left after taking the lock.
    let claimCommitted = false;
    vi.spyOn(Date, "now").mockImplementation(() =>
      claimCommitted ? 57_000 : 0,
    );
    const tx = claimTx([task], [undefined], [70]);
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) => {
        const result = await callback(tx);
        claimCommitted = true;
        return result;
      },
    );

    await handleDeletionEmails();

    expect(finalizeMock).toHaveBeenCalledWith(
      expect.objectContaining({ clerkBudgetMs: 10_000, deadline: 60_000 }),
    );
  });

  it("leaves a profile queued when the run ran out while waiting for its lock", async () => {
    const task = makeTask({ taskId: 31, profileId: 41, clerkId: "user_wait" });
    finalizeMock.mockResolvedValue({ kind: "out_of_time" });
    runClaim(claimTx([task], [{ id: 71, clerkDeletedAt: null, attempts: 2 }]));

    const result = await handleDeletionEmails();

    // Nothing was asked of Clerk, so nothing counts as a failure.
    expect(result).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("counts the claiming transaction against the run budget", async () => {
    const task = makeTask({ taskId: 40, profileId: 50, clerkId: "user_slow" });

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

    expect(finalizeMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("locks the profile row before reading or inserting its outbox entry", async () => {
    const task = makeTask({ taskId: 80, profileId: 90, clerkId: "user_lock" });
    runClaim(claimTx([task], [undefined], [100]));

    await handleDeletionEmails();

    // The user row goes first: that is what stops a concurrent run from
    // inserting a second active outbox entry. Push devices are not touched
    // here any more; they go in the delete itself, so a profile that is kept
    // keeps them.
    expect(lockedForUpdate).toEqual([
      "users:update",
      "pending:update",
      "pending:insert",
    ]);
  });

  it("skips a profile whose row disappeared while waiting for the lock", async () => {
    const task = makeTask({ taskId: 81, profileId: 91, clerkId: "user_raced" });
    runClaim(claimTx([task], [undefined], [101], [false]));

    const result = await handleDeletionEmails();

    // Never looked at the outbox, never inserted, never deleted anything.
    expect(lockedForUpdate).toEqual(["users:update"]);
    expect(finalizeMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
