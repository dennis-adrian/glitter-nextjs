import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { scrubDisciplinaryNotificationJobsForUser } from "@/app/lib/infractions/notifications";
import { forgetPushDevices } from "@/app/lib/notifications/push/devices";
import { scrubNotificationsNamingUser } from "@/app/lib/notifications/scrub";
import { detachPostsForDeletedUser } from "@/app/lib/posts/anonymization";
import { anonymizeProgramPurchasesForUser } from "@/app/lib/programs/anonymization";
import {
  checkClerkLogin,
  deleteClerkLogin,
} from "@/app/lib/users/clerk-deletion";
import {
  findProfileDeletionBlocker,
  forgetDeletedUserRequestLog,
  lockRowsTheDeleteCascadesTo,
  type ProfileDeletionBlocker,
} from "@/app/lib/users/deletion-blockers";
import {
  keepLegacyClerkAttempt,
  LEGACY_CLERK_FAILURE_PREFIX,
} from "@/app/lib/users/legacy-clerk-attempt";
import { db } from "@/db";
import { pendingUserDeletions, users } from "@/db/schema";

/**
 * The end of a profile deletion, shared by the admin's `deleteProfile` and the
 * cron that removes profiles never completed (`profile_tasks/actions.ts`).
 * Each caller keeps its own claim step and its own way of retrying; what they
 * share is the part that touches both the Clerk login and the local row,
 * where a mistake leaves a profile nobody can sign in to.
 *
 * The rules:
 * - From the last blocker check, through the Clerk call, to the local delete,
 *   one transaction holds the account's row FOR UPDATE. Every blocker is a
 *   row that references `users`, so writing one waits on that lock and then
 *   fails on the missing user: nothing new can block the delete once Clerk
 *   has been asked.
 * - Before that transaction, a short one under the same lock and checks
 *   commits `clerkAttemptedAt`. So the attempt is on record before the
 *   request goes out, even if the process dies during the Clerk call.
 * - Nothing else is written outside a transaction while it is open, so it
 *   never needs a second pool connection. What has to outlive a rollback is
 *   written again once the transaction has ended.
 * - A Clerk deletion whose outcome is unknown leaves `clerkAttemptedAt` set,
 *   and the pending row is not released while that request could still land.
 */

type DeletionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * How long an unconfirmed Clerk deletion has to be in the past before a read
 * that finds the login settles it. Far past the 100s function cap
 * (vercel.json). The Clerk SDK makes one request per call and never retries
 * it, and `deleteClerkUser` does not send a DELETE once its caller has given
 * up, so a request still unsent at that point never goes out. What this
 * cannot rule out is a request already handed to the network when the caller
 * gave up and then held back for longer than this; no Clerk API lets that be
 * cancelled or confirmed.
 */
export const UNCONFIRMED_ATTEMPT_SETTLES_AFTER_MS = 5 * 60_000;

/**
 * What a release found. `deleted` means the deletion was finished meanwhile
 * (by another run or an admin): nothing is kept, so there is nothing to park.
 */
export type LoginState = "intact" | "gone" | "unknown" | "deleted";

export type FinalizeOutcome =
  | { kind: "deleted" }
  /** The pending row was released or finished by another attempt. */
  | { kind: "conflict" }
  | {
      kind: "blocked";
      blocker: ProfileDeletionBlocker;
      /** The login was already gone before this attempt began. */
      loginAlreadyGone: boolean;
    }
  /** Clerk confirmed the login is still there; nothing local changed. */
  | { kind: "clerk_not_deleted"; message: string }
  /** Clerk's answer could not be confirmed; the row keeps the attempt. */
  | { kind: "clerk_unknown"; message: string }
  /** The deadline passed while waiting for the lock: Clerk was not asked. */
  | { kind: "out_of_time" }
  /**
   * The local delete failed. `loginGone` says whether the login is gone;
   * `loginRemovedNow`, whether this attempt is the one that removed it;
   * `attempts`, the row's count as last read under the lock, when it was
   * read (it may have changed since the caller claimed the row).
   */
  | {
      kind: "local_failed";
      error: unknown;
      loginGone: boolean;
      loginRemovedNow: boolean;
      attempts?: number;
    };

async function lockAccount(
  tx: DeletionTx,
  profileId: number,
  pendingId: number,
) {
  const [user] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, profileId))
    .limit(1)
    .for("update");
  const [pending] = await tx
    .select({
      id: pendingUserDeletions.id,
      clerkDeletedAt: pendingUserDeletions.clerkDeletedAt,
      clerkAttemptedAt: pendingUserDeletions.clerkAttemptedAt,
      localDeletedAt: pendingUserDeletions.localDeletedAt,
      lastError: pendingUserDeletions.lastError,
      updatedAt: pendingUserDeletions.updatedAt,
      attempts: pendingUserDeletions.attempts,
    })
    .from(pendingUserDeletions)
    .where(eq(pendingUserDeletions.id, pendingId))
    .limit(1)
    .for("update");
  return { user: user ?? null, pending: pending ?? null };
}

/**
 * The time a Clerk step may take, measured once the row lock is held: its own
 * bound, cut short by the caller's deadline. Zero or less means "do not ask".
 */
function remainingBudget(clerkBudgetMs: number, deadline?: number): number {
  return Math.min(
    clerkBudgetMs,
    deadline === undefined ? Infinity : deadline - Date.now(),
  );
}

/**
 * When an unconfirmed Clerk deletion was sent for this row, if one may have
 * been. Rows from the earlier code carry no marker; their Clerk failures are
 * read from `lastError` instead.
 */
function unconfirmedAttemptAt(pending: {
  clerkAttemptedAt: Date | null;
  lastError: string | null;
  updatedAt: Date;
}): Date | null {
  if (pending.clerkAttemptedAt) return pending.clerkAttemptedAt;
  if (pending.lastError?.startsWith(LEGACY_CLERK_FAILURE_PREFIX)) {
    return pending.updatedAt;
  }
  return null;
}

type LockedAccount = Awaited<ReturnType<typeof lockAccount>>;

/**
 * What stops a deletion before Clerk is asked, checked under the lock: run in
 * both transactions, since anything may have changed between them.
 */
async function stopBeforeClerk(
  tx: DeletionTx,
  input: { profileId: number; pendingId: number },
  { user, pending }: LockedAccount,
  now: Date,
): Promise<FinalizeOutcome | null> {
  if (!pending || pending.localDeletedAt) return { kind: "conflict" };
  if (!user) {
    // Removed by another path while this one waited: nothing left to do.
    await tx
      .update(pendingUserDeletions)
      .set({ localDeletedAt: now, lastError: null, updatedAt: now })
      .where(eq(pendingUserDeletions.id, input.pendingId));
    return { kind: "deleted" };
  }
  // Rows a blocker can reference without referencing the user (a return on
  // one of its orders): locked too, so none is written after this check.
  await lockRowsTheDeleteCascadesTo(tx, input.profileId);
  const blocker = await findProfileDeletionBlocker(tx, input.profileId);
  if (blocker) {
    return {
      kind: "blocked",
      blocker,
      loginAlreadyGone: pending.clerkDeletedAt != null,
    };
  }
  return null;
}

/**
 * Deletes the Clerk login and then the profile, or says why it did not.
 *
 * `clerkBudgetMs` bounds the whole Clerk step, which runs with the row
 * locked; `deadline` (epoch ms), when given, cuts it short, and is checked
 * after the lock is taken, so time spent waiting for it counts. Every
 * deletion, the admin's or the cron's, runs the same cleanup in that
 * transaction. `deletedPendingValues` adds columns to the pending row when
 * the profile goes.
 */
export async function finalizeProfileDeletion(input: {
  profileId: number;
  pendingId: number;
  clerkId: string;
  clerkBudgetMs: number;
  deadline?: number;
  deletedPendingValues?: (
    now: Date,
  ) => Partial<typeof pendingUserDeletions.$inferInsert>;
}): Promise<FinalizeOutcome> {
  const now = new Date();

  // First, the attempt goes on record and is committed, so it survives even
  // a process that dies during the Clerk call. Same lock and checks as the
  // delete itself; a deletion stopped here never sends anything.
  type Recorded =
    | { kind: "stop"; outcome: FinalizeOutcome }
    | { kind: "login_gone" }
    /** `replaced`: the unconfirmed attempt on record before this one. */
    | { kind: "recorded"; attemptAt: Date; replaced: Date | null };
  let recorded: Recorded;
  // The row's attempts as last read under the lock, for a caller that counts
  // failures: the count it claimed may have been changed since (the
  // user.deleted webhook makes a parked row claimable again).
  let seenAttempts: number | undefined;
  // Whether that same read found the login already gone.
  let seenLoginGone = false;
  try {
    recorded = await db.transaction(async (tx): Promise<Recorded> => {
      const locked = await lockAccount(tx, input.profileId, input.pendingId);
      seenAttempts = locked.pending?.attempts ?? seenAttempts;
      seenLoginGone = locked.pending?.clerkDeletedAt != null;
      const stop = await stopBeforeClerk(tx, input, locked, now);
      if (stop) return { kind: "stop", outcome: stop };
      const pending = locked.pending!;
      if (pending.clerkDeletedAt != null) return { kind: "login_gone" };
      if (remainingBudget(input.clerkBudgetMs, input.deadline) <= 0) {
        return { kind: "stop", outcome: { kind: "out_of_time" } };
      }

      // Taken now, after the lock wait: the marker must not be older than
      // the request it stands for, or the settle window would be shorter.
      const attemptAt = new Date();
      await tx
        .update(pendingUserDeletions)
        .set({ clerkAttemptedAt: attemptAt, updatedAt: attemptAt })
        .where(eq(pendingUserDeletions.id, input.pendingId));
      return {
        kind: "recorded",
        attemptAt,
        replaced: unconfirmedAttemptAt(pending),
      };
    });
  } catch (error) {
    // Nothing was sent; reported like any other failed attempt, so one bad
    // row does not stop a run working through many.
    // The login as the row said under the lock: a caller writing a failure
    // that assumes the login is still there must not write it to a row whose
    // login is already gone, nor skip one whose login is.
    return {
      kind: "local_failed",
      error,
      loginGone: seenLoginGone,
      loginRemovedNow: false,
      attempts: seenAttempts,
    };
  }
  if (recorded.kind === "stop") return recorded.outcome;

  // Whether the login is known to be gone, so a rollback below cannot lose it.
  let loginGone = recorded.kind === "login_gone";
  let loginRemovedNow = false;
  try {
    return await db.transaction(async (tx): Promise<FinalizeOutcome> => {
      const locked = await lockAccount(tx, input.profileId, input.pendingId);
      seenAttempts = locked.pending?.attempts ?? seenAttempts;
      // Refreshed with the count, before anything below can throw: the login
      // may have gone between the two transactions (the user.deleted webhook).
      if (locked.pending) loginGone = locked.pending.clerkDeletedAt != null;
      // Whether the marker on the row is still the one this attempt wrote,
      // or another attempt has written its own since.
      const markerIsOurs =
        recorded.kind === "recorded" &&
        locked.pending?.clerkAttemptedAt?.getTime() ===
          recorded.attemptAt.getTime();
      // A stop from here on sent nothing: the marker this attempt committed
      // goes back to exactly what it replaced, unfiltered, since nothing has
      // settled that one. Another attempt's marker is left to that attempt.
      const withdrawMarker = async () => {
        if (recorded.kind === "recorded" && markerIsOurs) {
          await tx
            .update(pendingUserDeletions)
            .set({ clerkAttemptedAt: recorded.replaced })
            .where(eq(pendingUserDeletions.id, input.pendingId));
        }
      };
      // Between the two transactions the lock was free: check it all again.
      const stop = await stopBeforeClerk(tx, input, locked, now);
      if (stop) {
        if (stop.kind === "blocked") await withdrawMarker();
        return stop;
      }
      const pending = locked.pending!;
      loginGone = pending.clerkDeletedAt != null;

      if (!loginGone) {
        if (recorded.kind !== "recorded") {
          // The login was gone at the first check and is back on record as
          // not deleted: another attempt changed it. Start again.
          return { kind: "conflict" };
        }
        const budget = remainingBudget(input.clerkBudgetMs, input.deadline);
        if (budget <= 0) {
          await withdrawMarker();
          return { kind: "out_of_time" };
        }

        // Fresh again: this lock may have been waited on as well.
        const sentAt = new Date();
        // Every other request whose outcome is still unknown: the one this
        // attempt's marker replaced, and one another attempt committed
        // between the two transactions. A definite answer to this attempt's
        // own request settles neither, so the later one stays on record,
        // unless it is old enough that the read below settles it.
        const others = [
          recorded.replaced,
          markerIsOurs ? null : unconfirmedAttemptAt(pending),
        ].filter((at): at is Date => at != null);
        const latestOther =
          others.length > 0
            ? new Date(Math.max(...others.map((at) => at.getTime())))
            : null;
        const earlierAttempt =
          latestOther &&
          sentAt.getTime() - latestOther.getTime() <
            UNCONFIRMED_ATTEMPT_SETTLES_AFTER_MS
            ? latestOther
            : null;
        await tx
          .update(pendingUserDeletions)
          .set({ clerkAttemptedAt: sentAt, updatedAt: sentAt })
          .where(eq(pendingUserDeletions.id, input.pendingId));

        const clerk = await deleteClerkLogin(input.clerkId, budget);
        if (clerk.kind === "not_deleted") {
          await tx
            .update(pendingUserDeletions)
            .set({
              clerkAttemptedAt: earlierAttempt,
              lastError: clerk.message,
              updatedAt: new Date(),
            })
            .where(eq(pendingUserDeletions.id, input.pendingId));
          return { kind: "clerk_not_deleted", message: clerk.message };
        }
        if (clerk.kind === "unknown") {
          await tx
            .update(pendingUserDeletions)
            .set({ lastError: clerk.message, updatedAt: new Date() })
            .where(eq(pendingUserDeletions.id, input.pendingId));
          return { kind: "clerk_unknown", message: clerk.message };
        }

        loginGone = true;
        loginRemovedNow = true;
        await tx
          .update(pendingUserDeletions)
          .set({
            clerkDeletedAt: new Date(),
            clerkAttemptedAt: null,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(pendingUserDeletions.id, input.pendingId));
      }

      // Its idempotency records only; RESTRICT, so they go first.
      await forgetDeletedUserRequestLog(tx, input.profileId);
      // Here rather than when the deletion is claimed: a refused deletion
      // gives the account back with its devices still subscribed.
      await forgetPushDevices(tx, input.profileId);
      // Their own inbox goes with the row; other people's items name them.
      await scrubNotificationsNamingUser(tx, input.profileId);
      // Program purchases are kept but anonymized, so attendance history and
      // seat counts survive. Required before the delete: their FK is
      // RESTRICT, so skipping this would abort the transaction.
      await anonymizeProgramPurchasesForUser(tx, input.profileId, now);
      // Published articles stay under "Equipo Glitter"; drafts and posts
      // still waiting to go out, scheduled ones included, go with their
      // author, so none is published after they are gone.
      await detachPostsForDeletedUser(tx, input.profileId);
      // Their queued disciplinary notices keep only what history and dedupe
      // need: the address and details go, and unsent ones are failed.
      await scrubDisciplinaryNotificationJobsForUser(tx, input.profileId, now);

      await tx.delete(users).where(eq(users.id, input.profileId));
      await tx
        .update(pendingUserDeletions)
        .set({
          localDeletedAt: now,
          lastError: null,
          updatedAt: now,
          ...input.deletedPendingValues?.(now),
        })
        .where(eq(pendingUserDeletions.id, input.pendingId));
      return { kind: "deleted" };
    });
  } catch (error) {
    if (loginGone) {
      // The rollback undid the record of the deletion. The connection is free
      // again, so write it once more: the next try must not ask Clerk to
      // remove a login that is already gone, or treat it as still there.
      try {
        const at = new Date();
        await db
          .update(pendingUserDeletions)
          .set({ clerkDeletedAt: at, clerkAttemptedAt: null, updatedAt: at })
          .where(
            and(
              eq(pendingUserDeletions.id, input.pendingId),
              isNull(pendingUserDeletions.clerkDeletedAt),
            ),
          );
      } catch (recordError) {
        console.error("Could not record a deleted Clerk login", recordError);
      }
    }
    // An unconfirmed attempt needs nothing written here: its marker was
    // committed before the request went out.
    return {
      kind: "local_failed",
      error,
      loginGone,
      loginRemovedNow,
      attempts: seenAttempts,
    };
  }
}

/**
 * Settles a deletion that will not go ahead: gives the account back when its
 * login is certainly intact, or says what is known about it.
 *
 * Under the same row lock as `finalizeProfileDeletion`, so it cannot release a
 * row another attempt is using. The pending row is removed, which ends the
 * "deletion pending" state that credits, notices and push all honour, only
 * when no Clerk request is unconfirmed, or the last one is old enough that it
 * can no longer land and Clerk says the login exists. A row the earlier code
 * left after a failed Clerk call counts as such a request.
 */
export async function releaseRefusedDeletion(input: {
  profileId: number;
  pendingId: number;
  clerkId: string;
  clerkBudgetMs: number;
  /** Epoch ms; checked after the lock is taken. */
  deadline?: number;
}): Promise<LoginState> {
  return db.transaction(async (tx): Promise<LoginState> => {
    const { pending } = await lockAccount(tx, input.profileId, input.pendingId);
    // Released by another attempt: nothing is pending here.
    if (!pending) return "intact";
    if (pending.localDeletedAt) return "deleted";
    if (pending.clerkDeletedAt) return "gone";

    const release = async () => {
      await tx
        .delete(pendingUserDeletions)
        .where(eq(pendingUserDeletions.id, input.pendingId));
      return "intact" as const;
    };

    const attemptedAt = unconfirmedAttemptAt(pending);
    if (!attemptedAt) return release();

    // Kept: a row the earlier code left is recognised only by its error,
    // which the next write to it replaces. Its attempt goes on record as a
    // marker, so the row is not taken for one that never sent anything.
    const keep = async () => {
      if (!pending.clerkAttemptedAt) {
        await tx
          .update(pendingUserDeletions)
          .set({ clerkAttemptedAt: attemptedAt })
          .where(eq(pendingUserDeletions.id, input.pendingId));
      }
      return "unknown" as const;
    };

    const budget = remainingBudget(input.clerkBudgetMs, input.deadline);
    if (budget <= 0) return keep();
    // Decided before the read, not after: a read that starts while the
    // request could still land says nothing about whether it later did.
    const settled =
      Date.now() - attemptedAt.getTime() >=
      UNCONFIRMED_ATTEMPT_SETTLES_AFTER_MS;
    const status = await checkClerkLogin(input.clerkId, budget);
    const now = new Date();
    if (status === "gone") {
      await tx
        .update(pendingUserDeletions)
        .set({ clerkDeletedAt: now, clerkAttemptedAt: null, updatedAt: now })
        .where(eq(pendingUserDeletions.id, input.pendingId));
      return "gone";
    }
    if (status === "exists" && settled) return release();
    return keep();
  });
}

/**
 * Records why a deletion stopped, outside any transaction. Only while the
 * deletion is unfinished: one completed meanwhile by another attempt is in
 * its notice phase, with its own attempts and address, and is left alone.
 */
export async function noteDeletionError(
  pendingId: number,
  lastError: string,
  extra: Partial<typeof pendingUserDeletions.$inferInsert> = {},
) {
  await db
    .update(pendingUserDeletions)
    .set({
      lastError,
      clerkAttemptedAt: keepLegacyClerkAttempt(),
      updatedAt: new Date(),
      ...extra,
    })
    .where(
      and(
        eq(pendingUserDeletions.id, pendingId),
        isNull(pendingUserDeletions.localDeletedAt),
      ),
    );
}
