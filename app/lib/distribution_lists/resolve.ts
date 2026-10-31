import "server-only";

import { type SQL, sql } from "drizzle-orm";

import {
  type AudienceCount,
  type DistributionListFilter,
  type DistributionListKind,
  expandDistributionListAreas,
  parseStoredDistributionListFilter,
  unreadableListFilterMessage,
} from "@/app/lib/distribution_lists/definitions";
import type { ParticipantSkipReason } from "@/app/lib/participants/recipient-eligibility";
import { participantSkipReasonSql } from "@/app/lib/participants/recipient-eligibility-queries";
import { db } from "@/db";
import {
  distributionListMembers,
  profileSubcategories,
  reservationParticipants,
  standReservations,
  users,
} from "@/db/schema";

/**
 * Who is on a list, as SQL (docs/IMPLEMENTATION-comunicados.md B2, B3). Each
 * builder returns a `SELECT` of one `user_id` column, possibly repeating a
 * person; callers dedupe. The ids travel as array parameters, so a long list
 * is still one parameter.
 *
 * Membership is not eligibility: a Confirmados list holds whoever is on an
 * accepted reservation, admins included, and the participant rule then
 * decides who can receive it (`participantSkipReasonSql`).
 */

export type Executor = Pick<typeof db, "execute">;

type ResolvableList = {
  id: number;
  name: string;
  kind: DistributionListKind;
  filter: unknown;
};

/** A stored filter that no longer parses. It refuses; it never means everyone. */
export class UnreadableListFilterError extends Error {
  constructor(
    readonly listId: number,
    readonly listName: string,
  ) {
    super(unreadableListFilterMessage(listName));
    this.name = "UnreadableListFilterError";
  }
}

function intArray(ids: readonly number[]) {
  return sql`${sql.param([...ids])}::int[]`;
}

function textArray(values: readonly string[]) {
  return sql`${sql.param([...values])}::text[]`;
}

/**
 * `festival_id, user_id, is_owner` for every accepted reservation, of these
 * festivals or (null) of all of them: each participations row, plus the owner.
 * The owner arm only matters for a legacy reservation whose owner has no
 * participations row; elsewhere the owner is one of them already. A person on
 * two reservations repeats.
 */
export function confirmadosHoldersSql(
  festivalIds: readonly number[] | null,
): SQL {
  const atFestivals =
    festivalIds === null
      ? sql`TRUE`
      : sql`${standReservations.festivalId} = ANY(${intArray(festivalIds)})`;
  return sql`
    SELECT ${standReservations.festivalId} AS festival_id,
           ${reservationParticipants.userId} AS user_id,
           (${standReservations.ownerUserId} IS NOT DISTINCT FROM ${reservationParticipants.userId}) AS is_owner
    FROM ${reservationParticipants}
    JOIN ${standReservations}
      ON ${standReservations.id} = ${reservationParticipants.reservationId}
    WHERE ${standReservations.status} = 'accepted' AND ${atFestivals}
    UNION ALL
    SELECT ${standReservations.festivalId}, ${standReservations.ownerUserId}, TRUE
    FROM ${standReservations}
    WHERE ${standReservations.status} = 'accepted'
      AND ${standReservations.ownerUserId} IS NOT NULL
      AND ${atFestivals}`;
}

/** "Confirmados · <festival>" (decision 4). */
export function confirmadosMemberIdsSql(festivalIds: readonly number[]): SQL {
  return sql`SELECT h.user_id FROM (${confirmadosHoldersSql(festivalIds)}) AS h`;
}

/**
 * On "Confirmados · F" for any F in `festivalIds`, legacy owners included, so
 * the filter's two festival fields agree with the festival lists. The holders
 * never repeat NULL, which keeps `NOT IN` safe.
 */
function confirmedAtAny(festivalIds: readonly number[]) {
  return sql`${users.id} IN (
    SELECT h.user_id FROM (${confirmadosHoldersSql(festivalIds)}) AS h
  )`;
}

/**
 * A saved filter list (B3). Lists only ever hold participants, so the role
 * and status are part of membership here.
 */
export function filterMemberIdsSql(filter: DistributionListFilter): SQL {
  const statuses = filter.includePaused ? ["verified", "paused"] : ["verified"];
  const conditions: SQL[] = [
    sql`${users.role} = 'user'`,
    sql`${users.status}::text = ANY(${textArray(statuses)})`,
  ];
  if (filter.areas.length > 0) {
    conditions.push(
      sql`${users.category}::text = ANY(${textArray(
        expandDistributionListAreas(filter.areas),
      )})`,
    );
  }
  if (filter.subcategoryIds.length > 0) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${profileSubcategories}
      WHERE ${profileSubcategories.profileId} = ${users.id}
        AND ${profileSubcategories.subcategoryId} = ANY(${intArray(filter.subcategoryIds)})
    )`);
  }
  if (filter.states.length > 0) {
    conditions.push(sql`${users.state} = ANY(${textArray(filter.states)})`);
  }
  if (filter.confirmedAtFestivalIds.length > 0) {
    conditions.push(confirmedAtAny(filter.confirmedAtFestivalIds));
  }
  if (filter.notConfirmedAtFestivalIds.length > 0) {
    conditions.push(
      sql`NOT ${confirmedAtAny(filter.notConfirmedAtFestivalIds)}`,
    );
  }
  return sql`SELECT ${users.id} AS user_id FROM ${users}
    WHERE ${sql.join(conditions, sql` AND `)}`;
}

/** Saved fixed lists. */
export function fixedMemberIdsSql(listIds: readonly number[]): SQL {
  return sql`SELECT ${distributionListMembers.userId} AS user_id
    FROM ${distributionListMembers}
    WHERE ${distributionListMembers.listId} = ANY(${intArray(listIds)})`;
}

/**
 * One saved list, filter or fixed. Throws `UnreadableListFilterError` for a
 * filter that no longer parses.
 */
export function listMemberIdsSql(list: ResolvableList): SQL {
  if (list.kind === "fixed") return fixedMemberIdsSql([list.id]);
  const filter = parseStoredDistributionListFilter(list.filter);
  if (!filter) throw new UnreadableListFilterError(list.id, list.name);
  return filterMemberIdsSql(filter);
}

/**
 * `user_id, reason` for the distinct people `memberIds` selects who still
 * exist: `reason` is the participant rule's key, null when they can receive
 * it. A deleted user drops out at the join.
 */
export function classifiedMembersSql(memberIds: SQL): SQL {
  return sql`
    SELECT ${users.id} AS user_id,
           ${participantSkipReasonSql({ id: users.id, role: users.role, status: users.status })} AS reason
    FROM (SELECT DISTINCT m.user_id FROM (${memberIds}) AS m(user_id)) AS d
    JOIN ${users} ON ${users.id} = d.user_id`;
}

/** The one count every screen shows (B4). */
export async function countAudience(
  executor: Executor,
  memberIds: SQL,
): Promise<AudienceCount> {
  const result = await executor.execute<{ eligible: number; skipped: number }>(
    sql`SELECT count(*) FILTER (WHERE c.reason IS NULL)::int AS eligible,
               count(*) FILTER (WHERE c.reason IS NOT NULL)::int AS skipped
        FROM (${classifiedMembersSql(memberIds)}) AS c`,
  );
  const row = result.rows[0];
  return { eligible: row?.eligible ?? 0, skipped: row?.skipped ?? 0 };
}

/** Distinct members with their reasons, for a list small enough to hold. */
export async function classifyMembers(
  executor: Executor,
  memberIds: SQL,
): Promise<{ userId: number; reason: ParticipantSkipReason | null }[]> {
  const result = await executor.execute<{
    user_id: number;
    reason: ParticipantSkipReason | null;
  }>(
    sql`SELECT c.user_id, c.reason FROM (${classifiedMembersSql(memberIds)}) AS c
        ORDER BY c.user_id`,
  );
  return result.rows.map((row) => ({
    userId: Number(row.user_id),
    reason: row.reason,
  }));
}
