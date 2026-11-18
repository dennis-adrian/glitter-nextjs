import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { MAX_DELETION_ATTEMPTS } from "@/app/lib/users/deletion-limits";
import { db } from "@/db";
import { pendingUserDeletions, users } from "@/db/schema";

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
  /** A deletion under way now knows the login is gone. */
  | { kind: "recorded"; profileId: number }
  /** Already known; a repeated delivery. */
  | { kind: "already_recorded"; profileId: number }
  /** The profile was being kept: it is now on record, parked for review. */
  | { kind: "flagged"; profileId: number };

/**
 * What Clerk's `user.deleted` event means for the profile with that login.
 *
 * Under the same locks, in the same order, as a profile deletion (the user's
 * row, then its pending deletion), so it waits for one in progress and sees
 * what it left. Writes no request to Clerk and deletes nothing.
 *
 * - A deletion under way gets `clerkDeletedAt`: whoever retries it next
 *   finishes the local delete without asking Clerk again.
 * - A profile the app was keeping gets a pending deletion with the login
 *   recorded as gone, parked at the attempt cap with
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

    const now = new Date();
    if (pending) {
      if (pending.clerkDeletedAt) {
        return { kind: "already_recorded", profileId: user.id };
      }
      await tx
        .update(pendingUserDeletions)
        .set({ clerkDeletedAt: now, clerkAttemptedAt: null, updatedAt: now })
        .where(eq(pendingUserDeletions.id, pending.id));
      return { kind: "recorded", profileId: user.id };
    }

    await tx.insert(pendingUserDeletions).values({
      userId: user.id,
      clerkId,
      clerkDeletedAt: now,
      lastError: LOGIN_DELETED_OUTSIDE_APP_ERROR,
      attempts: MAX_DELETION_ATTEMPTS,
      updatedAt: now,
    });
    return { kind: "flagged", profileId: user.id };
  });
}
