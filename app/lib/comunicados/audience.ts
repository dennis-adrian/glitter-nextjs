import "server-only";

import { eq, inArray, max, type SQL, sql } from "drizzle-orm";

import {
  COMUNICADO_MAX_RECIPIENTS,
  type ComunicadoAudience,
  ESSENTIAL_FESTIVAL_GRACE_DAYS,
} from "@/app/lib/comunicados/definitions";
import { COMUNICADO_SKIP_REASONS } from "@/app/lib/comunicados/skip-reasons";
import {
  type AudienceCount,
  confirmadosListName,
  type DistributionListKind,
  parseStoredDistributionListFilter,
  unreadableListFilterMessage,
} from "@/app/lib/distribution_lists/definitions";
import {
  confirmadosHoldersSql,
  listMemberIdsSql,
} from "@/app/lib/distribution_lists/resolve";
import {
  announcementOptOutOverridden,
  comunicadoEmailExclusion,
} from "@/app/lib/emails/suppressions";
import { isDeliverableEmail } from "@/app/lib/festivals/invitation-helpers";
import type { ComunicadosTx } from "@/app/lib/comunicados/locks";
import { comunicadoSkipReasonSql } from "@/app/lib/participants/recipient-eligibility-queries";
import { requireAdmin } from "@/app/lib/users/helpers";
import { getUserName } from "@/app/lib/users/utils";
import { db } from "@/db";
import {
  distributionLists,
  festivalDates,
  festivals,
  notificationCampaignRecipients,
  pendingUserDeletions,
  pushSubscriptions,
  users,
} from "@/db/schema";

/**
 * Who a comunicado reaches (docs/IMPLEMENTATION-comunicados.md B2, B4–B7).
 * One resolver for the composer's counts, the confirm dialog and the send's
 * snapshot: the sources, the dedupe and the B5 rule are SQL fragments, so the
 * send puts the same ones inside its INSERT. Only the snapshot writes.
 */

export type Executor = Pick<typeof db, "execute" | "select">;

/** A saved list as the resolver needs it, already loaded. */
export type AudienceList = {
  id: number;
  name: string;
  kind: DistributionListKind;
  filter: unknown;
};

export type ComunicadoAudienceSourcesInput = {
  festivals: readonly number[];
  /** Throws `UnreadableListFilterError` for a filter that no longer parses. */
  lists: readonly AudienceList[];
  people: readonly number[];
  /** Outside production (B6); the server's own environment, never the client's. */
  narrow: boolean;
  /** The stored audience names a festival or a saved list, found or not. */
  hasListSource: boolean;
};

function intArray(ids: readonly number[]) {
  return sql`${sql.param([...ids])}::int[]`;
}

/**
 * `source_key, user_id, via`: B2's sources, each row tagged with the source it
 * came from ('festival:<id>', 'list:<id>', 'people', 'staging'), so the counts
 * can tell sources apart. A person may repeat; deleted users are still here.
 */
function keyedSourcesSql(input: ComunicadoAudienceSourcesInput): SQL {
  const arms: SQL[] = [];
  if (input.festivals.length > 0) {
    arms.push(sql`SELECT 'festival:' || h.festival_id AS source_key, h.user_id, 'list'::text AS via
      FROM (${confirmadosHoldersSql(input.festivals)}) AS h`);
  }
  for (const list of input.lists) {
    arms.push(sql`SELECT ${`list:${list.id}`}::text AS source_key, m.user_id, 'list'::text AS via
      FROM (${listMemberIdsSql(list)}) AS m(user_id)`);
  }
  if (input.people.length > 0) {
    arms.push(sql`SELECT 'people'::text AS source_key, p.user_id, 'person'::text AS via
      FROM unnest(${intArray(input.people)}) AS p(user_id)`);
  }
  // A send to people alone reaches exactly them, on a preview too (decision 8).
  // An admin being deleted is not added at all, so "no lo reciben" never
  // names them (B6).
  if (input.narrow && input.hasListSource) {
    arms.push(sql`SELECT 'staging'::text AS source_key, ${users.id} AS user_id, 'staging_admin'::text AS via
      FROM ${users}
      WHERE ${users.role} = 'admin'
        AND NOT EXISTS (
          SELECT 1 FROM ${pendingUserDeletions}
          WHERE ${pendingUserDeletions.userId} = ${users.id}
            AND ${pendingUserDeletions.localDeletedAt} IS NULL
        )`);
  }
  if (arms.length === 0) {
    return sql`SELECT NULL::text AS source_key, NULL::int AS user_id, NULL::text AS via WHERE FALSE`;
  }
  return sql.join(arms, sql` UNION ALL `);
}

/**
 * The body of B2's `sources`: `user_id, via`, `via` one of 'list', 'person'
 * and 'staging_admin'. Staging admins, the global admins without a pending
 * deletion, come in only when `narrow` and the audience has a festival or
 * list source.
 */
export function comunicadoAudienceSourcesSql(
  input: ComunicadoAudienceSourcesInput,
): SQL {
  return sql`SELECT s.user_id, s.via FROM (${keyedSourcesSql(input)}) AS s`;
}

/**
 * `keyed, dedup, judged`: B4's dedupe (picked by name beats staging admin
 * beats list) and B5's rule, once with the narrowing and once without it, so
 * "pueden recibirlo hoy" is counted before narrowing (B6). `judged` holds one
 * row per person who still exists.
 */
function judgedCtes(input: ComunicadoAudienceSourcesInput): SQL {
  const person = { id: users.id, role: users.role, status: users.status };
  return sql`keyed AS (${keyedSourcesSql(input)}),
    dedup AS (
      SELECT k.user_id,
             CASE WHEN bool_or(k.via = 'person') THEN 'person'
                  WHEN bool_or(k.via = 'staging_admin') THEN 'staging_admin'
                  ELSE 'list' END AS source,
             -- As if not narrowed: NULL for an admin only standing in for the lists.
             CASE WHEN bool_or(k.via = 'person') THEN 'person'
                  WHEN bool_or(k.via = 'list') THEN 'list' END AS base_source,
             count(DISTINCT k.source_key) FILTER (WHERE k.via <> 'staging_admin') AS source_count
      FROM keyed k
      GROUP BY k.user_id
    ),
    judged AS (
      SELECT d.user_id, d.source, d.base_source, d.source_count,
             ${users.email} AS email,
             ${users.displayName} AS display_name,
             ${users.firstName} AS first_name,
             ${users.lastName} AS last_name,
             ${users.imageUrl} AS image_url,
             ${comunicadoSkipReasonSql(person, sql`d.source`, input.narrow)} AS reason,
             CASE WHEN d.base_source IS NOT NULL
                  THEN ${comunicadoSkipReasonSql(person, sql`d.base_source`, false)} END AS base_reason
      FROM dedup d
      JOIN ${users} ON ${users.id} = d.user_id
    )`;
}

/**
 * `user_id, source, reason`: the rows the send snapshots (B4), one per person
 * who still exists, `reason` the B5 label or NULL when they receive it. The
 * SELECT twin of the send's INSERT.
 */
export function comunicadoAudienceRowsSql(
  input: ComunicadoAudienceSourcesInput,
): SQL {
  return sql`WITH ${judgedCtes(input)}
    SELECT j.user_id, j.source, j.reason FROM judged j`;
}

export type AudienceSourceKind = "festival" | "list" | "people";

export type ComunicadoAudienceSourcePreview = {
  kind: AudienceSourceKind;
  /** Null for the people picked by name, who are one source. */
  id: number | null;
  label: string;
  /** "Pueden recibirlo hoy" for this source alone, before narrowing. */
  count: AudienceCount;
  /** Why this source cannot be used as it is; an archived list is fine. */
  problem: string | null;
};

export type ComunicadoEssentialAllowed = {
  ok: boolean;
  reason: string | null;
  /** The one festival it would be essential for, when it can be. */
  festival: { id: number; name: string } | null;
};

export type ComunicadoAudiencePreview = {
  sources: ComunicadoAudienceSourcePreview[];
  /** Distinct people across the sources who still exist. */
  matched: number;
  /** "Pueden recibirlo hoy", before narrowing (B4, B6). */
  eligible: number;
  /** People in more than one source, counted once. */
  overlap: number;
  /** Who would not receive it, by B5 label, after narrowing; most first. */
  skipped: { reason: string; count: number }[];
  skippedTotal: number;
  /** Rows the send would write `pending`, after narrowing. */
  willReceive: number;
  /**
   * Among `willReceive`, split by the rules the send applies (B7); they add
   * up to `willReceive`. Counted whether or not email is ticked. An essential
   * send moves the announcements opt-outs to `sendTo` and counts them in
   * `essentialOverride`.
   */
  email: {
    sendTo: number;
    unsubscribedAnnouncements: number;
    unsubscribedAll: number;
    suppressed: number;
    invalid: number;
    essentialOverride: number;
  };
  /** Among `willReceive`, people with at least one device. */
  pushDevices: number;
  /** Their devices. */
  pushSubscriptions: number;
  /** Over COMUNICADO_MAX_RECIPIENTS, counted before narrowing (B6). */
  tooLarge: boolean;
  /** The lists went to the admins instead (B6). */
  narrowed: boolean;
  /** Admins standing in for the lists who would receive it. */
  stagingAdmins: number;
  essentialAllowed: ComunicadoEssentialAllowed;
};

export type ComunicadoPreviewOptions = {
  narrow: boolean;
  /** Applied only when the audience allows it (B7). */
  essential: boolean;
  sendEmail: boolean;
};

export const ESSENTIAL_NOT_ALLOWED_MESSAGE =
  "Solo un comunicado a un único «Confirmados · festival» de un festival en curso o próximo, con correo, puede ser esencial.";

const MISSING_FESTIVAL_PROBLEM = "No encontramos ese festival.";
const MISSING_LIST_PROBLEM = "Esa lista ya no está disponible.";

/**
 * Addresses this simple are deliverable by `isDeliverableEmail`; the few that
 * are not this simple are checked with it in code, as the send does (D3), so
 * the count never depends on a regex ported to SQL.
 */
const PLAIN_ADDRESS = "^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+$";

type LoadedFestival = {
  id: number;
  name: string;
  status: string;
  lastEndDate: Date | null;
};

type LoadedList = AudienceList & { archivedAt: Date | null };

type ResolvedAudience = {
  input: ComunicadoAudienceSourcesInput;
  sources: ComunicadoAudienceSourcePreview[];
  festivals: Map<number, LoadedFestival>;
};

const NO_COUNT: AudienceCount = { eligible: 0, skipped: 0 };

async function loadFestivals(executor: Executor, ids: readonly number[]) {
  if (ids.length === 0) return new Map<number, LoadedFestival>();
  const rows = await executor
    .select({
      id: festivals.id,
      name: festivals.name,
      status: festivals.status,
      lastEndDate: max(festivalDates.endDate),
    })
    .from(festivals)
    .leftJoin(festivalDates, eq(festivalDates.festivalId, festivals.id))
    .where(inArray(festivals.id, [...ids]))
    .groupBy(festivals.id);
  return new Map(rows.map((row) => [row.id, row]));
}

async function loadLists(executor: Executor, ids: readonly number[]) {
  if (ids.length === 0) return new Map<number, LoadedList>();
  const rows = await executor
    .select({
      id: distributionLists.id,
      name: distributionLists.name,
      kind: distributionLists.kind,
      filter: distributionLists.filter,
      archivedAt: distributionLists.archivedAt,
    })
    .from(distributionLists)
    .where(inArray(distributionLists.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row]));
}

function peopleLabel(count: number) {
  return count === 1 ? "1 persona por nombre" : `${count} personas por nombre`;
}

/**
 * The stored audience's sources, loaded: what the resolver can use, and one
 * entry per source for the chips. A missing festival or list, or a filter that
 * no longer parses, is left out of the resolver and named as a problem; an
 * archived list still resolves (B2).
 */
async function resolveAudienceSources(
  executor: Executor,
  audience: ComunicadoAudience,
  narrow: boolean,
): Promise<ResolvedAudience> {
  const [festivalRows, listRows] = await Promise.all([
    loadFestivals(executor, audience.festivals),
    loadLists(executor, audience.lists),
  ]);
  const sources: ComunicadoAudienceSourcePreview[] = [];
  const usable = { festivals: [] as number[], lists: [] as AudienceList[] };

  for (const id of audience.festivals) {
    const festival = festivalRows.get(id);
    if (!festival) {
      sources.push({
        kind: "festival",
        id,
        label: `Festival #${id}`,
        count: NO_COUNT,
        problem: MISSING_FESTIVAL_PROBLEM,
      });
      continue;
    }
    usable.festivals.push(id);
    sources.push({
      kind: "festival",
      id,
      label: confirmadosListName(festival.name),
      count: NO_COUNT,
      problem: null,
    });
  }
  for (const id of audience.lists) {
    const list = listRows.get(id);
    if (!list) {
      sources.push({
        kind: "list",
        id,
        label: `Lista #${id}`,
        count: NO_COUNT,
        problem: MISSING_LIST_PROBLEM,
      });
      continue;
    }
    const unreadable =
      list.kind === "filter" &&
      parseStoredDistributionListFilter(list.filter) === null;
    if (!unreadable) usable.lists.push(list);
    sources.push({
      kind: "list",
      id,
      label: list.name,
      count: NO_COUNT,
      problem: unreadable ? unreadableListFilterMessage(list.name) : null,
    });
  }
  if (audience.people.length > 0) {
    sources.push({
      kind: "people",
      id: null,
      label: peopleLabel(audience.people.length),
      count: NO_COUNT,
      problem: null,
    });
  }

  return {
    input: {
      festivals: usable.festivals,
      lists: usable.lists,
      people: audience.people,
      narrow,
      hasListSource: audience.festivals.length + audience.lists.length > 0,
    },
    sources,
    festivals: festivalRows,
  };
}

export type ResolvedComunicadoAudience = {
  input: ComunicadoAudienceSourcesInput;
  sources: ComunicadoAudienceSourcePreview[];
  /** The first source that cannot be used as it is, or null. */
  problem: string | null;
};

/**
 * The stored audience as the send snapshots it (B2). A missing festival or
 * list, or a filter that no longer parses, is named in `problem`: the send
 * refuses it rather than leave the source out, so a broken list never quietly
 * changes who it reaches (V9).
 */
export async function resolveComunicadoAudience(
  executor: Executor,
  audience: ComunicadoAudience,
  { narrow }: { narrow: boolean },
): Promise<ResolvedComunicadoAudience> {
  const { input, sources } = await resolveAudienceSources(
    executor,
    audience,
    narrow,
  );
  return {
    input,
    sources,
    problem: sources.find((source) => source.problem)?.problem ?? null,
  };
}

function sourceKey(source: ComunicadoAudienceSourcePreview) {
  return source.kind === "people" ? "people" : `${source.kind}:${source.id}`;
}

/**
 * B7: exactly one festival source, nothing else, email ticked, and the
 * festival current or upcoming. A festival without dates is judged by its
 * status alone.
 */
function judgeEssential(
  audience: ComunicadoAudience,
  sendEmail: boolean,
  festivalRows: Map<number, LoadedFestival>,
  now: Date,
): ComunicadoEssentialAllowed {
  const refused = {
    ok: false,
    reason: ESSENTIAL_NOT_ALLOWED_MESSAGE,
    festival: null,
  };
  if (
    audience.festivals.length !== 1 ||
    audience.lists.length > 0 ||
    audience.people.length > 0 ||
    !sendEmail
  ) {
    return refused;
  }
  const festival = festivalRows.get(audience.festivals[0]!);
  if (!festival || festival.status === "archived") return refused;
  const graceStart =
    now.getTime() - ESSENTIAL_FESTIVAL_GRACE_DAYS * 24 * 60 * 60_000;
  if (festival.lastEndDate && festival.lastEndDate.getTime() < graceStart) {
    return refused;
  }
  return {
    ok: true,
    reason: null,
    festival: { id: festival.id, name: festival.name },
  };
}

/**
 * Whether this audience may be essential (B7), for the save, the schedule and
 * the send to check on the server. Reads festivals only. `at` is when it goes
 * out: now, or a schedule's time, which the release will judge it at.
 */
export async function comunicadoEssentialAllowed(
  executor: Executor,
  audience: ComunicadoAudience,
  { sendEmail, at = new Date() }: { sendEmail: boolean; at?: Date },
): Promise<ComunicadoEssentialAllowed> {
  const festivalRows =
    audience.festivals.length === 1
      ? await loadFestivals(executor, audience.festivals)
      : new Map<number, LoadedFestival>();
  return judgeEssential(audience, sendEmail, festivalRows, at);
}

type SummaryRow = {
  matched: number;
  eligible: number;
  overlap: number;
  staging_admins: number;
  skipped: { reason: string; count: number }[];
  per_source: { key: string; eligible: number; skipped: number }[];
  will_receive: number;
  suppressed: number;
  unsubscribed_all: number;
  unsubscribed_announcements: number;
  not_excluded: number;
  overridden_plain: number;
  unusual_addresses: { email: string; overridden: boolean }[];
  push_people: number;
  push_subscriptions: number;
};

/**
 * Today's numbers for an audience, in one statement, without the access
 * check: for `previewComunicadoAudience` and for the send, inside its own
 * transaction.
 */
export async function summarizeComunicadoAudience(
  executor: Executor,
  audience: ComunicadoAudience,
  opts: ComunicadoPreviewOptions,
): Promise<ComunicadoAudiencePreview> {
  const resolved = await resolveAudienceSources(
    executor,
    audience,
    opts.narrow,
  );
  const essentialAllowed = judgeEssential(
    audience,
    opts.sendEmail,
    resolved.festivals,
    new Date(),
  );
  // Counting as essential where it cannot be would promise mail the send refuses.
  const essential = opts.essential && essentialAllowed.ok;
  const person = { id: users.id, role: users.role, status: users.status };

  const result = await executor.execute<SummaryRow>(sql`
    WITH ${judgedCtes(resolved.input)},
    receiving AS (
      SELECT j.user_id, j.email AS email,
             ${comunicadoEmailExclusion(sql`j.email`, { essential })} AS exclusion,
             ${comunicadoEmailExclusion(sql`j.email`, { essential: true })} AS hard_exclusion,
             ${announcementOptOutOverridden(sql`j.email`, essential)} AS overridden,
             coalesce(j.email ~ ${PLAIN_ADDRESS}, false) AS plain_address,
             (SELECT count(*) FROM ${pushSubscriptions}
              WHERE ${pushSubscriptions.userId} = j.user_id)::int AS devices
      FROM judged j
      WHERE j.reason IS NULL
    ),
    source_members AS (
      SELECT DISTINCT k.source_key, k.user_id, k.via
      FROM keyed k
      WHERE k.via <> 'staging_admin'
    ),
    per_source AS (
      SELECT sm.source_key,
             count(*) FILTER (WHERE c.reason IS NULL)::int AS eligible,
             count(*) FILTER (WHERE c.reason IS NOT NULL)::int AS skipped
      FROM source_members sm
      JOIN ${users} ON ${users.id} = sm.user_id
      CROSS JOIN LATERAL (
        SELECT ${comunicadoSkipReasonSql(person, sql`sm.via`, false)} AS reason
      ) c
      GROUP BY sm.source_key
    )
    SELECT
      (SELECT count(*) FROM judged WHERE base_source IS NOT NULL)::int AS matched,
      (SELECT count(*) FROM judged
       WHERE base_source IS NOT NULL AND base_reason IS NULL)::int AS eligible,
      (SELECT count(*) FROM judged WHERE source_count > 1)::int AS overlap,
      (SELECT count(*) FROM judged
       WHERE source = 'staging_admin' AND reason IS NULL)::int AS staging_admins,
      (SELECT coalesce(json_agg(json_build_object('reason', s.reason, 'count', s.n)
                                ORDER BY s.n DESC, s.reason), '[]'::json)
       FROM (SELECT reason, count(*)::int AS n FROM judged
             WHERE reason IS NOT NULL GROUP BY reason) s) AS skipped,
      (SELECT coalesce(json_agg(json_build_object(
                'key', p.source_key, 'eligible', p.eligible, 'skipped', p.skipped)), '[]'::json)
       FROM per_source p) AS per_source,
      t.*
    FROM (
      SELECT count(*)::int AS will_receive,
             count(*) FILTER (WHERE r.exclusion = 'suppressed')::int AS suppressed,
             count(*) FILTER (WHERE r.exclusion = 'unsubscribed'
                                AND r.hard_exclusion = 'unsubscribed')::int AS unsubscribed_all,
             count(*) FILTER (WHERE r.exclusion = 'unsubscribed'
                                AND r.hard_exclusion IS NULL)::int AS unsubscribed_announcements,
             count(*) FILTER (WHERE r.exclusion IS NULL)::int AS not_excluded,
             count(*) FILTER (WHERE r.exclusion IS NULL AND r.overridden
                                AND r.plain_address)::int AS overridden_plain,
             coalesce(json_agg(json_build_object('email', r.email, 'overridden', r.overridden))
                        FILTER (WHERE r.exclusion IS NULL AND NOT r.plain_address),
                      '[]'::json) AS unusual_addresses,
             count(*) FILTER (WHERE r.devices > 0)::int AS push_people,
             coalesce(sum(r.devices), 0)::int AS push_subscriptions
      FROM receiving r
    ) t`);
  const row = result.rows[0]!;

  const counts = new Map(row.per_source.map((entry) => [entry.key, entry]));
  const sources = resolved.sources.map((source) => {
    const count = source.problem ? undefined : counts.get(sourceKey(source));
    return {
      ...source,
      count: count
        ? { eligible: count.eligible, skipped: count.skipped }
        : NO_COUNT,
    };
  });

  let invalid = 0;
  let unusualOverridden = 0;
  for (const address of row.unusual_addresses) {
    if (!isDeliverableEmail(address.email)) invalid += 1;
    else if (address.overridden) unusualOverridden += 1;
  }
  const skippedTotal = row.skipped.reduce((sum, entry) => sum + entry.count, 0);

  return {
    sources,
    matched: row.matched,
    eligible: row.eligible,
    overlap: row.overlap,
    skipped: row.skipped,
    skippedTotal,
    willReceive: row.will_receive,
    email: {
      sendTo: row.not_excluded - invalid,
      unsubscribedAnnouncements: row.unsubscribed_announcements,
      unsubscribedAll: row.unsubscribed_all,
      suppressed: row.suppressed,
      invalid,
      essentialOverride: row.overridden_plain + unusualOverridden,
    },
    pushDevices: row.push_people,
    pushSubscriptions: row.push_subscriptions,
    tooLarge: row.eligible > COMUNICADO_MAX_RECIPIENTS,
    narrowed: resolved.input.narrow && resolved.input.hasListSource,
    stagingAdmins: row.staging_admins,
    essentialAllowed,
  };
}

export type ComunicadoSnapshotCounts = {
  /** Distinct people across the sources who still exist, before narrowing. */
  matched: number;
  /**
   * "Pueden recibirlo hoy", before narrowing: what the cap and the typed
   * count are compared with.
   */
  eligible: number;
  /** Rows written `pending`, after narrowing. */
  willReceive: number;
  /** Among them, the admins standing in for the lists. */
  stagingAdmins: number;
  /** Among them, the people picked by name. */
  pickedByName: number;
  /** Rows written `skipped`, by B5 label, most first. */
  skipped: { reason: string; count: number }[];
};

type SnapshotCountsRow = {
  matched: number;
  eligible: number;
  will_receive: number;
  staging_admins: number;
  picked_by_name: number;
  skipped: { reason: string; count: number }[];
};

/**
 * B4's snapshot, inside the send transaction: one recipient row per person
 * who still exists, `pending` or `skipped` with its B5 label and the source
 * they came in by, and the counts read back from the same statement, which
 * decide the send's refusals. Rows go in ascending user id, so the foreign-key
 * locks on `users` are taken in the order reservations take theirs.
 */
export async function snapshotComunicadoRecipients(
  tx: ComunicadosTx,
  campaignId: number,
  input: ComunicadoAudienceSourcesInput,
): Promise<ComunicadoSnapshotCounts> {
  const result = await tx.execute<SnapshotCountsRow>(sql`
    WITH ${judgedCtes(input)},
    inserted AS (
      INSERT INTO ${notificationCampaignRecipients}
        (campaign_id, user_id, status, skipped_reason, source, processed_at)
      SELECT ${campaignId}::int, j.user_id,
             (CASE WHEN j.reason IS NULL THEN 'pending' ELSE 'skipped' END)
               ::notification_campaign_recipient_status,
             j.reason, j.source::campaign_recipient_source,
             CASE WHEN j.reason IS NULL THEN NULL ELSE now() END
      FROM judged j
      ORDER BY j.user_id
      ON CONFLICT (campaign_id, user_id) DO NOTHING
      RETURNING status, skipped_reason, source
    )
    SELECT
      (SELECT count(*) FROM judged WHERE base_source IS NOT NULL)::int AS matched,
      (SELECT count(*) FROM judged
       WHERE base_source IS NOT NULL AND base_reason IS NULL)::int AS eligible,
      (SELECT count(*) FROM inserted WHERE status = 'pending')::int AS will_receive,
      (SELECT count(*) FROM inserted
       WHERE status = 'pending' AND source = 'staging_admin')::int AS staging_admins,
      (SELECT count(*) FROM inserted
       WHERE status = 'pending' AND source = 'person')::int AS picked_by_name,
      (SELECT coalesce(json_agg(json_build_object('reason', s.reason, 'count', s.n)
                                ORDER BY s.n DESC, s.reason), '[]'::json)
       FROM (SELECT skipped_reason AS reason, count(*)::int AS n FROM inserted
             WHERE status = 'skipped' GROUP BY skipped_reason) s) AS skipped`);
  const row = result.rows[0]!;
  return {
    matched: row.matched,
    eligible: row.eligible,
    willReceive: row.will_receive,
    stagingAdmins: row.staging_admins,
    pickedByName: row.picked_by_name,
    skipped: row.skipped,
  };
}

/** The confirm dialog names this many people picked by name, at most. */
export const PICKED_RECEIVING_NAMES_MAX = 10;

/**
 * Who among the people picked by name receives it, as the snapshot would
 * judge them, for the confirm dialog's test-environment callout (G5): how
 * many, and the first names in alphabetical order. Reads only.
 */
export async function pickedPeopleReceiving(
  executor: Executor,
  people: readonly number[],
  narrow: boolean,
): Promise<{ count: number; names: string[] }> {
  if (people.length === 0) return { count: 0, names: [] };
  const person = { id: users.id, role: users.role, status: users.status };
  const result = await executor.execute<{
    email: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  }>(sql`
    SELECT ${users.email} AS email, ${users.displayName} AS display_name,
           ${users.firstName} AS first_name, ${users.lastName} AS last_name
    FROM ${users}
    WHERE ${users.id} = ANY(${intArray(people)})
      AND ${comunicadoSkipReasonSql(person, sql`'person'`, narrow)} IS NULL`);
  const names = result.rows
    .map(
      (row) =>
        getUserName({
          displayName: row.display_name,
          firstName: row.first_name,
          lastName: row.last_name,
        }) || row.email,
    )
    .sort((a, b) => a.localeCompare(b, "es"));
  return {
    count: names.length,
    names: names.slice(0, PICKED_RECEIVING_NAMES_MAX),
  };
}

/**
 * The composer's live summary (G4): who a draft would reach today. Global
 * admins only; null for anyone else. Reads only.
 */
export async function previewComunicadoAudience(
  audience: ComunicadoAudience,
  opts: ComunicadoPreviewOptions,
): Promise<ComunicadoAudiencePreview | null> {
  if (!(await requireAdmin())) return null;
  return summarizeComunicadoAudience(db, audience, opts);
}

export const COMUNICADO_SKIPPED_PREVIEW_LIMIT = 50;

export type ComunicadoSkippedPerson = {
  userId: number;
  name: string;
  email: string;
  imageUrl: string | null;
  /** The B5 label. */
  reason: string;
};

/**
 * "Ver por qué": the first 50 people who would not receive it, real reasons
 * before the preview narrowing, then by name. Global admins only.
 */
export async function previewSkippedPeople(
  audience: ComunicadoAudience,
  opts: Pick<ComunicadoPreviewOptions, "narrow">,
): Promise<ComunicadoSkippedPerson[] | null> {
  if (!(await requireAdmin())) return null;
  const resolved = await resolveAudienceSources(db, audience, opts.narrow);
  const result = await db.execute<{
    user_id: number;
    email: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    image_url: string | null;
    reason: string;
  }>(sql`
    WITH ${judgedCtes(resolved.input)}
    SELECT j.user_id, j.email, j.display_name, j.first_name, j.last_name,
           j.image_url, j.reason
    FROM judged j
    WHERE j.reason IS NOT NULL
    ORDER BY (j.reason = ${COMUNICADO_SKIP_REASONS.staging}),
             lower(coalesce(
               nullif(btrim(j.display_name), ''),
               nullif(btrim(concat_ws(' ', j.first_name, j.last_name)), ''),
               j.email
             )),
             j.user_id
    LIMIT ${COMUNICADO_SKIPPED_PREVIEW_LIMIT}`);
  return result.rows.map((row) => ({
    userId: Number(row.user_id),
    name:
      getUserName({
        displayName: row.display_name,
        firstName: row.first_name,
        lastName: row.last_name,
      }) || row.email,
    email: row.email,
    imageUrl: row.image_url,
    reason: row.reason,
  }));
}
