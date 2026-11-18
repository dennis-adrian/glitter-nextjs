import { sql } from "drizzle-orm";

import { pendingUserDeletions } from "@/db/schema";

/**
 * What the code before `clerk_attempted_at` existed wrote when a Clerk call
 * failed, timed out included. A row it left with this error and no marker
 * may have a deletion on its way, as of its last change.
 */
export const LEGACY_CLERK_FAILURE_PREFIX = "clerk_delete_failed";

/**
 * For `clerkAttemptedAt` in any write that replaces `lastError` on an
 * unfinished deletion: a row from the earlier code is recognised only by that
 * error, so its attempt goes on record as a marker first (as of its last
 * change, read before this write). Every other row keeps its marker as is.
 */
export function keepLegacyClerkAttempt() {
  return sql`CASE
    WHEN ${pendingUserDeletions.clerkAttemptedAt} IS NULL
      AND ${pendingUserDeletions.clerkDeletedAt} IS NULL
      AND ${pendingUserDeletions.lastError} LIKE ${`${LEGACY_CLERK_FAILURE_PREFIX}%`}
    THEN ${pendingUserDeletions.updatedAt}
    ELSE ${pendingUserDeletions.clerkAttemptedAt}
  END`;
}
