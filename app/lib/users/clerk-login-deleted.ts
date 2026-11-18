import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { MAX_DELETION_ATTEMPTS } from "@/app/lib/users/deletion-limits";
import { db } from "@/db";
import { pendingUserDeletions, scheduledTasks, users } from "@/db/schema";

/**
 * Stored on a profile whose Clerk login was deleted without the app deleting
 * the profile: a request that landed after its deletion was given up (see
 * `UNCONFIRMED_ATTEMPT_SETTLES_AFTER_MS`), or a deletion made in Clerk itself.
 */
export const LOGIN_DELETED_OUTSIDE_APP_ERROR =
  "clerk_login_deleted_outside_app";

export type ClerkLoginDeletedResult =
  /** No profile has this login: deleted with it, or never created. */
  | { kind: "no_profile" }
  /** Already known; a repeated delivery. */
  | { kind: "already_recorded"; profileId: number }
  /**
   * A sign-up never completed: the cron that removes those owns it, and now
   * finishes it when its task is due, without asking Clerk.
   */
  | { kind: "queued"; profileId: number }
  /**
   * For an operator: a profile the app was keeping, or an admin's deletion
   * under way, which only an admin retries. The login is recorded as gone.
   */
  | { kind: "flagged"; profileId: number };

/**
 * What Clerk's `user.deleted` event means for the profile with that login.
 *
 * Under the same locks, in the same order, as a profile deletion (the user's
 * row, then its pending deletion), so it waits for one in progress and sees
 * what it left. Writes no request to Clerk and deletes nothing.
 *
 * - A deletion under way gets `clerkDeletedAt`: whoever retries it next
 *   finishes the local delete without asking Clerk again. One the cron owns
 *   is made claimable again if it had been parked; any other (an admin's,
 *   retried only by an admin) is reported as flagged for an operator.
 * - A sign-up never completed, whose open profile-creation task the cron
 *   will act on, gets a pending deletion with the login recorded as gone and
 *   no attempts spent, so the cron finishes it as it would have anyway.
 * - Any other profile the app was keeping gets a pending deletion with the
 *   login recorded as gone, parked at the attempt cap with
 *   `LOGIN_DELETED_OUTSIDE_APP_ERROR`. That marks it as leaving: nothing is
 *   moved to it and its devices get nothing, since nobody can sign in to it.
 *   An admin then decides: deleting the profile finishes without Clerk, and
 *   one something keeps is refused with the login reported as gone.
 */
export async function recordClerkLoginDeleted(
  clerkId: string,
): Promise<ClerkLoginDeletedResult> {
  return db.transaction(async (tx): Promise<ClerkLoginDeletedResult> => {
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1)
      .for("update");
    if (!user) return { kind: "no_profile" };

    const [pending] = await tx
      .select({
        id: pendingUserDeletions.id,
        clerkDeletedAt: pendingUserDeletions.clerkDeletedAt,
      })
      .from(pendingUserDeletions)
      .where(
        and(
          eq(pendingUserDeletions.userId, user.id),
          isNull(pendingUserDeletions.localDeletedAt),
        ),
      )
      .orderBy(desc(pendingUserDeletions.updatedAt))
      .limit(1)
      .for("update");

    // A sign-up never completed belongs to the cron that removes those: its
    // row is left claimable, never parked, so the cron finishes the delete
    // when the task is due.
    const [cronTask] = await tx
      .select({ id: scheduledTasks.id })
      .from(scheduledTasks)
      .where(
        and(
          eq(scheduledTasks.profileId, user.id),
          eq(scheduledTasks.taskType, "profile_creation"),
          isNull(scheduledTasks.completedAt),
          eq(scheduledTasks.ranAfterDueDate, false),
        ),
      )
      .limit(1);

    const now = new Date();
    if (pending) {
      if (pending.clerkDeletedAt) {
        return { kind: "already_recorded", profileId: user.id };
      }
      await tx
        .update(pendingUserDeletions)
        .set({
          clerkDeletedAt: now,
          clerkAttemptedAt: null,
          updatedAt: now,
          // A row the cron had parked (Clerk kept refusing) is claimable
          // again: nothing is left to ask Clerk.
          ...(cronTask ? { attempts: 0, nextAttemptAt: now } : {}),
        })
        .where(eq(pendingUserDeletions.id, pending.id));
      if (cronTask) return { kind: "queued", profileId: user.id };
      // No cron comes back to it: an admin's deletion is only ever retried
      // by an admin, whatever its attempts. An operator has to know.
      return { kind: "flagged", profileId: user.id };
    }

    await tx.insert(pendingUserDeletions).values({
      userId: user.id,
      clerkId,
      clerkDeletedAt: now,
      lastError: LOGIN_DELETED_OUTSIDE_APP_ERROR,
      attempts: cronTask ? 0 : MAX_DELETION_ATTEMPTS,
      nextAttemptAt: now,
      updatedAt: now,
    });
    return cronTask
      ? { kind: "queued", profileId: user.id }
      : { kind: "flagged", profileId: user.id };
  });
}
