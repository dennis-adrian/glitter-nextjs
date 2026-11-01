import "server-only";

import { and, asc, eq, isNull, type SQL, sql } from "drizzle-orm";

import {
  type AudienceCount,
  type ConfirmadosMember,
  confirmadosListName,
  DISTRIBUTION_LIST_MEMBERS_PAGE_SIZE,
  DISTRIBUTION_LIST_PREVIEW_NAMES,
  type DistributionListFilter,
  type DistributionListMember,
  type DistributionListSource,
  type DistributionListSummary,
  type FestivalListSummary,
  type Paged,
  parseStoredDistributionListFilter,
} from "@/app/lib/distribution_lists/definitions";
import {
  classifiedMembersSql,
  classifyMembers,
  confirmadosHoldersSql,
  confirmadosMemberIdsSql,
  countAudience,
  filterMemberIdsSql,
  listMemberIdsSql,
  UnreadableListFilterError,
} from "@/app/lib/distribution_lists/resolve";
import {
  PARTICIPANT_SKIP_REASONS,
  type ParticipantSkipReason,
} from "@/app/lib/participants/recipient-eligibility";
import { participantSkipReasonSql } from "@/app/lib/participants/recipient-eligibility-queries";
import { requireAdmin } from "@/app/lib/users/helpers";
import { userSearchCondition } from "@/app/lib/users/search-condition";
import { getUserName } from "@/app/lib/users/utils";
import { db } from "@/db";
import {
  distributionListMembers,
  distributionLists,
  festivals,
  subcategories,
  users,
} from "@/db/schema";

/** Lists hold participant data: global admins only (decision 2). */
async function canReadLists() {
  return (await requireAdmin()) !== null;
}

/** How the lists order people: by the name the dashboard shows, then id. */
const memberNameOrder = sql`lower(coalesce(
  nullif(btrim(${users.displayName}), ''),
  nullif(btrim(concat_ws(' ', ${users.firstName}, ${users.lastName})), ''),
  ${users.email}
)), ${users.id}`;

const memberColumns = sql`${users.id} AS user_id,
  ${users.displayName} AS display_name,
  ${users.firstName} AS first_name,
  ${users.lastName} AS last_name,
  ${users.email} AS email,
  ${users.imageUrl} AS image_url,
  ${participantSkipReasonSql({ id: users.id, role: users.role, status: users.status })} AS reason`;

type MemberRow = {
  user_id: number;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  image_url: string | null;
  reason: ParticipantSkipReason | null;
};

function toMember(row: MemberRow): DistributionListMember {
  const name = getUserName({
    displayName: row.display_name,
    firstName: row.first_name,
    lastName: row.last_name,
  });
  return {
    userId: Number(row.user_id),
    name: name || row.email,
    email: row.email,
    imageUrl: row.image_url,
    skipReason: row.reason ? PARTICIPANT_SKIP_REASONS[row.reason] : null,
  };
}

function pageOf(page: number) {
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/**
 * The page to show for `total` people: the one asked for, or the last one
 * when it is past the end (after "Quitar" empties the last page, say).
 */
function clampPage(page: number, total: number) {
  return Math.min(
    pageOf(page),
    Math.max(1, Math.ceil(total / DISTRIBUTION_LIST_MEMBERS_PAGE_SIZE)),
  );
}

async function countRows(rows: SQL) {
  const result = await db.execute<{ total: number }>(
    sql`SELECT count(*)::int AS total FROM (${rows}) AS r`,
  );
  return result.rows[0]?.total ?? 0;
}

function paged<T>(rows: T[], total: number, page: number): Paged<T> {
  return {
    rows,
    total,
    page,
    pageCount: Math.max(
      1,
      Math.ceil(total / DISTRIBUTION_LIST_MEMBERS_PAGE_SIZE),
    ),
  };
}

/**
 * "Confirmados · <festival>" for every festival, past ones included, newest
 * first, with today's counts. One statement over the accepted-reservations
 * index.
 */
export async function fetchFestivalLists(): Promise<FestivalListSummary[]> {
  if (!(await canReadLists())) return [];
  const result = await db.execute<{
    id: number;
    name: string;
    status: string;
    start_date: Date | string | null;
    eligible: number;
    skipped: number;
  }>(sql`
    WITH members AS (
      SELECT DISTINCT h.festival_id, h.user_id
      FROM (${confirmadosHoldersSql(null)}) AS h
    ),
    classified AS (
      SELECT members.festival_id,
             ${participantSkipReasonSql({ id: users.id, role: users.role, status: users.status })} AS reason
      FROM members
      JOIN ${users} ON ${users.id} = members.user_id
    )
    SELECT ${festivals.id} AS id, ${festivals.name} AS name,
           ${festivals.status} AS status, ${festivals.startDate} AS start_date,
           count(classified.festival_id) FILTER (WHERE classified.reason IS NULL)::int AS eligible,
           count(classified.festival_id) FILTER (WHERE classified.reason IS NOT NULL)::int AS skipped
    FROM ${festivals}
    LEFT JOIN classified ON classified.festival_id = ${festivals.id}
    GROUP BY ${festivals.id}
    ORDER BY ${festivals.startDate} DESC NULLS LAST, ${festivals.id} DESC`);
  return result.rows.map((row) => ({
    festivalId: Number(row.id),
    festivalName: row.name,
    festivalStatus: row.status,
    startDate: row.start_date ? new Date(row.start_date) : null,
    count: { eligible: row.eligible, skipped: row.skipped },
  }));
}

export async function fetchConfirmadosFestival(festivalId: number): Promise<{
  festivalId: number;
  festivalName: string;
  listName: string;
  festivalStatus: string;
  count: AudienceCount;
} | null> {
  if (!(await canReadLists())) return null;
  const [festival] = await db
    .select({
      id: festivals.id,
      name: festivals.name,
      status: festivals.status,
    })
    .from(festivals)
    .where(eq(festivals.id, festivalId))
    .limit(1);
  if (!festival) return null;
  return {
    festivalId: festival.id,
    festivalName: festival.name,
    listName: confirmadosListName(festival.name),
    festivalStatus: festival.status,
    count: await countAudience(db, confirmadosMemberIdsSql([festival.id])),
  };
}

/** A festival's list, 50 at a time, with how each person holds a reservation. */
export async function fetchConfirmadosMembers(
  festivalId: number,
  page: number,
): Promise<Paged<ConfirmadosMember>> {
  if (!(await canReadLists())) return paged([], 0, pageOf(page));
  const holders = sql`
    SELECT h.user_id, bool_or(h.is_owner) AS is_owner,
           bool_or(NOT h.is_owner) AS is_partner
    FROM (${confirmadosHoldersSql([festivalId])}) AS h
    JOIN ${users} ON ${users.id} = h.user_id
    GROUP BY h.user_id`;
  const total = await countRows(holders);
  const current = clampPage(page, total);
  const result = await db.execute<
    MemberRow & { is_owner: boolean; is_partner: boolean }
  >(sql`
    SELECT ${memberColumns}, holders.is_owner, holders.is_partner
    FROM (${holders}) AS holders
    JOIN ${users} ON ${users.id} = holders.user_id
    ORDER BY ${memberNameOrder}
    LIMIT ${DISTRIBUTION_LIST_MEMBERS_PAGE_SIZE}
    OFFSET ${(current - 1) * DISTRIBUTION_LIST_MEMBERS_PAGE_SIZE}`);
  return paged(
    result.rows.map((row) => ({
      ...toMember(row),
      isOwner: row.is_owner,
      isPartner: row.is_partner,
    })),
    total,
    current,
  );
}

type ListRow = typeof distributionLists.$inferSelect;

/**
 * Counts for many saved lists in one statement. A filter that no longer
 * parses has no count: nothing can use the list until it is edited.
 */
async function countSavedLists(
  lists: Pick<ListRow, "id" | "name" | "kind" | "filter">[],
): Promise<Map<number, AudienceCount | null>> {
  const counts = new Map<number, AudienceCount | null>();
  const arms: SQL[] = [];
  const fixedIds: number[] = [];
  for (const list of lists) {
    if (list.kind === "fixed") {
      fixedIds.push(list.id);
      counts.set(list.id, { eligible: 0, skipped: 0 });
      continue;
    }
    const filter = parseStoredDistributionListFilter(list.filter);
    if (!filter) {
      counts.set(list.id, null);
      continue;
    }
    counts.set(list.id, { eligible: 0, skipped: 0 });
    arms.push(
      sql`SELECT ${list.id}::int AS list_id, f.user_id FROM (${filterMemberIdsSql(filter)}) AS f`,
    );
  }
  if (fixedIds.length > 0) {
    arms.push(
      sql`SELECT ${distributionListMembers.listId} AS list_id, ${distributionListMembers.userId} AS user_id
          FROM ${distributionListMembers}
          WHERE ${distributionListMembers.listId} = ANY(${sql.param(fixedIds)}::int[])`,
    );
  }
  if (arms.length === 0) return counts;

  const result = await db.execute<{
    list_id: number;
    eligible: number;
    skipped: number;
  }>(sql`
    WITH members AS (
      SELECT DISTINCT a.list_id, a.user_id FROM (${sql.join(arms, sql` UNION ALL `)}) AS a
    ),
    classified AS (
      SELECT members.list_id,
             ${participantSkipReasonSql({ id: users.id, role: users.role, status: users.status })} AS reason
      FROM members
      JOIN ${users} ON ${users.id} = members.user_id
    )
    SELECT list_id,
           count(*) FILTER (WHERE reason IS NULL)::int AS eligible,
           count(*) FILTER (WHERE reason IS NOT NULL)::int AS skipped
    FROM classified
    GROUP BY list_id`);
  for (const row of result.rows) {
    counts.set(Number(row.list_id), {
      eligible: row.eligible,
      skipped: row.skipped,
    });
  }
  return counts;
}

/** The saved lists the pickers offer: every one not archived, by name. */
export async function fetchSavedLists(): Promise<DistributionListSummary[]> {
  if (!(await canReadLists())) return [];
  const lists = await db
    .select()
    .from(distributionLists)
    .where(isNull(distributionLists.archivedAt))
    .orderBy(
      asc(sql`lower(${distributionLists.name})`),
      asc(distributionLists.id),
    );
  const counts = await countSavedLists(lists);
  return lists.map((list) => ({
    id: list.id,
    name: list.name,
    description: list.description,
    kind: list.kind,
    count: counts.get(list.id) ?? null,
    updatedAt: list.updatedAt,
  }));
}

export type DistributionListDetail = DistributionListSummary & {
  archivedAt: Date | null;
  /** A filter list's criteria; null for a fixed list or an unreadable filter. */
  filter: DistributionListFilter | null;
  /** True for a filter list whose stored filter no longer parses. */
  unreadableFilter: boolean;
};

/** One saved list, archived ones included (an old link still opens). */
export async function fetchDistributionList(
  listId: number,
): Promise<DistributionListDetail | null> {
  if (!(await canReadLists())) return null;
  const [list] = await db
    .select()
    .from(distributionLists)
    .where(eq(distributionLists.id, listId))
    .limit(1);
  if (!list) return null;
  const filter =
    list.kind === "filter"
      ? parseStoredDistributionListFilter(list.filter)
      : null;
  const counts = await countSavedLists([list]);
  return {
    id: list.id,
    name: list.name,
    description: list.description,
    kind: list.kind,
    count: counts.get(list.id) ?? null,
    updatedAt: list.updatedAt,
    archivedAt: list.archivedAt,
    filter,
    unreadableFilter: list.kind === "filter" && filter === null,
  };
}

/** A fixed list's people, 50 at a time. */
export async function fetchFixedListMembers(
  listId: number,
  page: number,
): Promise<Paged<DistributionListMember>> {
  if (!(await canReadLists())) return paged([], 0, pageOf(page));
  const total = await countRows(
    sql`SELECT 1 FROM ${distributionListMembers}
        WHERE ${distributionListMembers.listId} = ${listId}`,
  );
  const current = clampPage(page, total);
  const result = await db.execute<MemberRow>(sql`
    SELECT ${memberColumns}
    FROM ${distributionListMembers}
    JOIN ${users} ON ${users.id} = ${distributionListMembers.userId}
    WHERE ${distributionListMembers.listId} = ${listId}
    ORDER BY ${memberNameOrder}
    LIMIT ${DISTRIBUTION_LIST_MEMBERS_PAGE_SIZE}
    OFFSET ${(current - 1) * DISTRIBUTION_LIST_MEMBERS_PAGE_SIZE}`);
  return paged(result.rows.map(toMember), total, current);
}

/**
 * The filter editor's live panel: today's count and the first names of those
 * who can receive it.
 */
export async function previewFilterAudience(
  filter: DistributionListFilter,
): Promise<{ count: AudienceCount; names: DistributionListMember[] } | null> {
  if (!(await canReadLists())) return null;
  const members = filterMemberIdsSql(filter);
  const [count, first] = await Promise.all([
    countAudience(db, members),
    db.execute<MemberRow>(sql`
      SELECT ${memberColumns}
      FROM (${classifiedMembersSql(members)}) AS c
      JOIN ${users} ON ${users.id} = c.user_id
      WHERE c.reason IS NULL
      ORDER BY ${memberNameOrder}
      LIMIT ${DISTRIBUTION_LIST_PREVIEW_NAMES}`),
  ]);
  return { count, names: first.rows.map(toMember) };
}

/**
 * Participants matching a name or email, for "Agregar por nombre o correo".
 * Lists hold participants only, so nobody else is offered.
 */
export async function searchDistributionListCandidates(
  query: string,
  listId: number | null,
): Promise<(DistributionListMember & { alreadyMember: boolean })[]> {
  const term = query.trim();
  if (term.length < 2 || term.length > 100) return [];
  if (!(await canReadLists())) return [];
  const result = await db.execute<MemberRow & { already_member: boolean }>(sql`
    SELECT ${memberColumns},
           ${
             listId === null
               ? sql`FALSE`
               : sql`EXISTS (
                   SELECT 1 FROM ${distributionListMembers}
                   WHERE ${distributionListMembers.listId} = ${listId}
                     AND ${distributionListMembers.userId} = ${users.id}
                 )`
           } AS already_member
    FROM ${users}
    WHERE ${users.role} = 'user' AND ${userSearchCondition(term)}
    ORDER BY ${memberNameOrder}
    LIMIT 8`);
  return result.rows.map((row) => ({
    ...toMember(row),
    alreadyMember: row.already_member,
  }));
}

/** What the filter editor offers: every subcategory and every festival. */
export async function fetchListFilterOptions() {
  if (!(await canReadLists())) return null;
  const [subcategoryRows, festivalRows] = await Promise.all([
    db
      .select({
        id: subcategories.id,
        label: subcategories.label,
        category: subcategories.category,
      })
      .from(subcategories)
      .orderBy(
        asc(subcategories.category),
        asc(subcategories.sortOrder),
        asc(subcategories.label),
      ),
    db
      .select({ id: festivals.id, name: festivals.name })
      .from(festivals)
      .orderBy(sql`${festivals.startDate} DESC NULLS LAST`, asc(festivals.id)),
  ]);
  return { subcategories: subcategoryRows, festivals: festivalRows };
}

export type ResolvedListSource =
  | {
      ok: true;
      label: string;
      /** Distinct members who still exist, each with the participant rule's verdict. */
      members: { userId: number; reason: ParticipantSkipReason | null }[];
    }
  | { ok: false; message: string };

/**
 * A festival's or a saved list's members, for a caller that expands them into
 * explicit people (the credit-gift picker). An archived list is refused, since
 * archiving takes a list out of the pickers.
 */
export async function resolveListSourceMembers(
  source: DistributionListSource,
): Promise<ResolvedListSource> {
  if (!(await canReadLists())) {
    return { ok: false, message: "No autorizado." };
  }
  let label: string;
  let memberIds: SQL;
  if (source.kind === "festival") {
    const [festival] = await db
      .select({ id: festivals.id, name: festivals.name })
      .from(festivals)
      .where(eq(festivals.id, source.festivalId))
      .limit(1);
    if (!festival) {
      return { ok: false, message: "No encontramos ese festival." };
    }
    label = confirmadosListName(festival.name);
    memberIds = confirmadosMemberIdsSql([festival.id]);
  } else {
    const [list] = await db
      .select({
        id: distributionLists.id,
        name: distributionLists.name,
        kind: distributionLists.kind,
        filter: distributionLists.filter,
      })
      .from(distributionLists)
      .where(
        and(
          eq(distributionLists.id, source.listId),
          isNull(distributionLists.archivedAt),
        ),
      )
      .limit(1);
    if (!list) {
      return { ok: false, message: "Esa lista ya no está disponible." };
    }
    label = list.name;
    try {
      memberIds = listMemberIdsSql(list);
    } catch (error) {
      if (error instanceof UnreadableListFilterError) {
        return { ok: false, message: error.message };
      }
      throw error;
    }
  }
  const members = await classifyMembers(db, memberIds);
  return {
    ok: true,
    label,
    members,
  };
}
