import "server-only";

import { and, inArray, isNull, type SQL, sql } from "drizzle-orm";

import {
  COMUNICADO_SKIP_REASONS,
  type ComunicadoSkipReasonLabel,
} from "@/app/lib/comunicados/skip-reasons";
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

/**
 * The comunicado rule (docs/IMPLEMENTATION-comunicados.md B5, rows 1–7) as SQL
 * over a users row and how the person entered the audience: `source` is
 * 'list', 'person' or 'staging_admin'. The label stored in `skipped_reason`,
 * or NULL when they receive it; the first match wins. Real ineligibility is
 * judged before the preview narrowing, so a preview's counts still exercise
 * the rule. `narrow` is the server's own environment, never the client's.
 * Use it in raw `sql`: the select builder prints a lone table's columns bare,
 * and the pending-deletion subquery would then read `"id"` as its own.
 */
export function comunicadoSkipReasonSql(
  user: {
    id: SQL | typeof users.id;
    role: SQL | typeof users.role;
    status: SQL | typeof users.status;
  },
  source: SQL,
  narrow: boolean,
): SQL<ComunicadoSkipReasonLabel | null> {
  const labels = COMUNICADO_SKIP_REASONS;
  // Outside production, only people picked by name and the admins standing in
  // for the lists receive it. A NULL or unknown source does not pass.
  const staging = narrow
    ? sql`WHEN ${source} IS DISTINCT FROM 'person'
           AND ${source} IS DISTINCT FROM 'staging_admin' THEN ${labels.staging}`
    : sql``;
  return sql<ComunicadoSkipReasonLabel | null>`CASE
    WHEN EXISTS (
      SELECT 1 FROM ${pendingUserDeletions}
      WHERE ${pendingUserDeletions.userId} = ${user.id}
        AND ${pendingUserDeletions.localDeletedAt} IS NULL
    ) THEN ${labels.deletion_pending}::text
    WHEN ${source} IN ('person', 'staging_admin')
      AND ${user.role} = 'admin' AND ${user.status} <> 'banned' THEN NULL
    -- Added as an admin and no longer one: row 2 let every current admin through.
    WHEN ${source} = 'staging_admin' THEN ${labels.not_participant}
    WHEN ${user.role} <> 'user' THEN ${labels.not_participant}
    WHEN ${user.status} = 'banned' THEN ${labels.banned}
    WHEN NOT (${user.status}::text = ANY(${sql.param([...PARTICIPANT_READ_ONLY_ROUTE_STATUSES])}::text[])) THEN ${labels.not_verified}
    ${staging}
    ELSE NULL
  END`;
}
