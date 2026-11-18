import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { forgetPushDevices } from "@/app/lib/notifications/push/devices";
import { scrubNotificationsNamingUser } from "@/app/lib/notifications/scrub";
import { anonymizeProgramPurchasesForUser } from "@/app/lib/programs/anonymization";
import {
  checkClerkLogin,
  deleteClerkLogin,
} from "@/app/lib/users/clerk-deletion";
import {
  findProfileDeletionBlocker,
  forgetDeletedUserRequestLog,
  type ProfileDeletionBlocker,
} from "@/app/lib/users/deletion-blockers";
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
 * - Nothing else is written outside that transaction while it is open, so it
 *   never needs a second pool connection. What has to outlive a rollback is
 *   written again once the transaction has ended.
 * - A Clerk deletion whose outcome is unknown leaves `clerkAttemptedAt` set,
 *   and the pending row is not released while that request could still land.
 */

type DeletionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * How long an unconfirmed Clerk deletion has to be in the past before a read
 * that finds the login settles it. Far past the 100s function cap, so the
 * request that went unanswered can no longer be on its way.
 */
export const UNCONFIRMED_ATTEMPT_SETTLES_AFTER_MS = 5 * 60_000;

export type LoginState = "intact" | "gone" | "unknown";

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
  /** The local delete failed. `loginGone` says whether the login is gone. */
  | { kind: "local_failed"; error: unknown; loginGone: boolean };

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
    })
    .from(pendingUserDeletions)
    .where(eq(pendingUserDeletions.id, pendingId))
    .limit(1)
    .for("update");
  return { user: user ?? null, pending: pending ?? null };
}

/**
 * Deletes the Clerk login and then the profile, or says why it did not.
 *
 * `clerkBudgetMs` bounds the whole Clerk step, which runs with the row
 * locked. `beforeUserDelete` is the caller's own cleanup, in the same
 * transaction; `deletedPendingValues` adds columns to the pending row when
 * the profile goes.
 */
export async function finalizeProfileDeletion(input: {
  profileId: number;
  pendingId: number;
  clerkId: string;
  clerkBudgetMs: number;
  beforeUserDelete?: (tx: DeletionTx, now: Date) => Promise<unknown>;
  deletedPendingValues?: (
    now: Date,
  ) => Partial<typeof pendingUserDeletions.$inferInsert>;
}): Promise<FinalizeOutcome> {
  const now = new Date();
  // Whether the login is known to be gone, so a rollback below cannot lose it.
  let loginGone = false;
  try {
    return await db.transaction(async (tx): Promise<FinalizeOutcome> => {
      const { user, pending } = await lockAccount(
        tx,
        input.profileId,
        input.pendingId,
      );
      if (!pending || pending.localDeletedAt) return { kind: "conflict" };

      if (!user) {
        // Removed by another path while this one waited: nothing left to do.
        await tx
          .update(pendingUserDeletions)
          .set({ localDeletedAt: now, lastError: null, updatedAt: now })
          .where(eq(pendingUserDeletions.id, input.pendingId));
        return { kind: "deleted" };
      }

      loginGone = pending.clerkDeletedAt != null;
      const blocker = await findProfileDeletionBlocker(tx, input.profileId);
      if (blocker) {
        return { kind: "blocked", blocker, loginAlreadyGone: loginGone };
      }

      if (!loginGone) {
        // Committed with the outcome if it stays unknown, so a later attempt
        // knows a request may still be on its way.
        await tx
          .update(pendingUserDeletions)
          .set({ clerkAttemptedAt: now, updatedAt: now })
          .where(eq(pendingUserDeletions.id, input.pendingId));

        const clerk = await deleteClerkLogin(
          input.clerkId,
          input.clerkBudgetMs,
        );
        if (clerk.kind === "not_deleted") {
          await tx
            .update(pendingUserDeletions)
            .set({
              clerkAttemptedAt: null,
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
      await input.beforeUserDelete?.(tx, now);

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
    return { kind: "local_failed", error, loginGone };
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
 * can no longer land and Clerk says the login exists.
 */
export async function releaseRefusedDeletion(input: {
  profileId: number;
  pendingId: number;
  clerkId: string;
  clerkBudgetMs: number;
}): Promise<LoginState> {
  return db.transaction(async (tx): Promise<LoginState> => {
    const { pending } = await lockAccount(tx, input.profileId, input.pendingId);
    // Released by another attempt, or finished: nothing is pending here.
    if (!pending) return "intact";
    if (pending.localDeletedAt || pending.clerkDeletedAt) return "gone";

    const release = async () => {
      await tx
        .delete(pendingUserDeletions)
        .where(eq(pendingUserDeletions.id, input.pendingId));
      return "intact" as const;
    };

    if (!pending.clerkAttemptedAt) return release();

    const status = await checkClerkLogin(input.clerkId, input.clerkBudgetMs);
    const now = new Date();
    if (status === "gone") {
      await tx
        .update(pendingUserDeletions)
        .set({ clerkDeletedAt: now, clerkAttemptedAt: null, updatedAt: now })
        .where(eq(pendingUserDeletions.id, input.pendingId));
      return "gone";
    }
    if (
      status === "exists" &&
      now.getTime() - pending.clerkAttemptedAt.getTime() >=
        UNCONFIRMED_ATTEMPT_SETTLES_AFTER_MS
    ) {
      return release();
    }
    return "unknown";
  });
}

/** Records why a deletion stopped, outside any transaction. */
export async function noteDeletionError(
  pendingId: number,
  lastError: string,
  extra: Partial<typeof pendingUserDeletions.$inferInsert> = {},
) {
  await db
    .update(pendingUserDeletions)
    .set({ lastError, updatedAt: new Date(), ...extra })
    .where(eq(pendingUserDeletions.id, pendingId));
}
