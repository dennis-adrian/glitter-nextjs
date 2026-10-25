import "server-only";

import { and, inArray, isNull, type SQL, sql } from "drizzle-orm";

import { PARTICIPANT_READ_ONLY_ROUTE_STATUSES } from "@/app/lib/participants/definitions";
import {
  type ParticipantSkipReason,
  participantSkipReason,
} from "@/app/lib/participants/recipient-eligibility";
import { db } from "@/db";
import { pendingUserDeletions, users } from "@/db/schema";

/** Who among `userIds` has a profile deletion under way. */
export async function pendingDeletionUserIds(
  executor: Pick<typeof db, "select">,
  userIds: readonly number[],
) {
  if (userIds.length === 0) return new Set<number>();
  const rows = await executor
    .select({ userId: pendingUserDeletions.userId })
    .from(pendingUserDeletions)
    .where(
      and(
        inArray(pendingUserDeletions.userId, [...userIds]),
        isNull(pendingUserDeletions.localDeletedAt),
      ),
    );
  return new Set(
    rows.map((row) => row.userId).filter((id): id is number => id != null),
  );
}

/**
 * Who among `userIds` would be skipped, and why; a missing user is absent from
 * the map. Callers that act on it check again under their own locks, since a
 * profile can be banned or deleted in between.
 */
export async function classifyParticipantRecipients(
  userIds: readonly number[],
) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) {
    return new Map<number, ParticipantSkipReason | null>();
  }
  const [rows, deleting] = await Promise.all([
    db
      .select({ id: users.id, role: users.role, status: users.status })
      .from(users)
      .where(inArray(users.id, unique)),
    pendingDeletionUserIds(db, unique),
  ]);
  const reasons = new Map<number, ParticipantSkipReason | null>();
  for (const row of rows) {
    reasons.set(
      row.id,
      deleting.has(row.id) ? "deletion_pending" : participantSkipReason(row),
    );
  }
  return reasons;
}

/**
 * `participantSkipReason` plus the pending deletion, as SQL over a users row:
 * the reason's key, or NULL when the person can receive it. For counts taken
 * in one statement, so they match `classifyParticipantRecipients` exactly.
 */
export function participantSkipReasonSql(user: {
  id: SQL | typeof users.id;
  role: SQL | typeof users.role;
  status: SQL | typeof users.status;
}): SQL<ParticipantSkipReason | null> {
  return sql<ParticipantSkipReason | null>`CASE
    WHEN EXISTS (
      SELECT 1 FROM ${pendingUserDeletions}
      WHERE ${pendingUserDeletions.userId} = ${user.id}
        AND ${pendingUserDeletions.localDeletedAt} IS NULL
    ) THEN 'deletion_pending'
    WHEN ${user.role} <> 'user' THEN 'not_participant'
    WHEN ${user.status} = 'banned' THEN 'banned'
    WHEN NOT (${user.status}::text = ANY(${sql.param([...PARTICIPANT_READ_ONLY_ROUTE_STATUSES])}::text[])) THEN 'not_verified'
    ELSE NULL
  END`;
}
