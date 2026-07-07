"use server";

import AccountPausedEmailTemplate from "@/app/emails/account-paused";
import { BaseProfile, ProfileType, UserCategory } from "@/app/api/users/definitions";
import {
  DEFAULT_PARTICIPANT_VISIBLE_STATUSES,
  ParticipantActivitySummary,
  ParticipantAggregates,
  ParticipantProfile,
  ParticipantSortField,
} from "@/app/lib/participants/definitions";
import {
  filterParticipantStatuses,
  getPauseEligibilityReason,
} from "@/app/lib/participants/helpers";
import {
  buildWhereClauseForProfileFetching,
  getCurrentUserProfile,
} from "@/app/lib/users/helpers";
import { formatDate } from "@/app/lib/formatters";
import {
  updateUserStatusWithAudit,
} from "@/app/lib/users/status-events";
import { sendEmail } from "@/app/vendors/resend";
import { db } from "@/db";
import { users } from "@/db/schema";
import { buildWhereClause } from "@/db/utils";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type ParticipantListFilters = {
  limit: number;
  offset: number;
  includeAdmins?: boolean;
  status?: BaseProfile["status"][];
  category?: UserCategory[];
  query?: string;
  sort: ParticipantSortField;
  direction: "asc" | "desc";
  profileCompletion: "complete" | "incomplete" | "all";
  pauseEligible?: boolean;
};

type ParticipantRow = {
  id: number;
  last_participation_at: Date | string | null;
  last_participation_festival_name: string | null;
  last_terms_accepted_at: Date | string | null;
  last_terms_accepted_festival_name: string | null;
  accepted_participations_count: number;
  accepted_terms_count: number;
  participated_recently: boolean;
  status: BaseProfile["status"];
  role: BaseProfile["role"];
};

function toActivityDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  const formatted = formatDate(value);
  return formatted.isValid ? formatted.toJSDate() : null;
}

function buildParticipantOrderBy(
  sort: ParticipantSortField,
  direction: "asc" | "desc",
) {
  const directionSql = direction === "asc" ? sql`asc` : sql`desc`;

  switch (sort) {
    case "lastParticipationAt":
      return sql`last_participation_at ${directionSql} nulls last, ${users.id} desc`;
    case "lastTermsAcceptedAt":
      return sql`last_terms_accepted_at ${directionSql} nulls last, ${users.id} desc`;
    case "displayName":
      return sql`${users.displayName} ${directionSql} nulls last, ${users.id} desc`;
    case "category":
      return sql`${users.category} ${directionSql}, ${users.id} desc`;
    case "status":
      return sql`${users.status} ${directionSql}, ${users.id} desc`;
    case "verifiedAt":
      return sql`${users.verifiedAt} ${directionSql} nulls last, ${users.id} desc`;
    case "createdAt":
      return sql`${users.createdAt} ${directionSql}, ${users.id} desc`;
    case "updatedAt":
    default:
      return sql`${users.updatedAt} ${directionSql}, ${users.id} desc`;
  }
}

async function buildParticipantWhereClause(
  filters: Omit<ParticipantListFilters, "limit" | "offset" | "sort" | "direction">,
) {
  const participantStatuses = filters.status?.length
    ? filterParticipantStatuses(filters.status)
    : [...DEFAULT_PARTICIPANT_VISIBLE_STATUSES];

  const whereClause = await buildWhereClauseForProfileFetching(
    {
      includeAdmins: filters.includeAdmins,
      status: participantStatuses,
      category: filters.category,
      query: filters.query,
      profileCompletion: filters.profileCompletion,
    },
    true,
  );

  buildWhereClause(
    whereClause,
    sql`${users.status} in ${participantStatuses}`,
  );

  if (filters.pauseEligible) {
    buildWhereClause(
      whereClause,
      sql`${users.status} = 'verified' and ${users.role} = 'user' and coalesce(pa.participated_recently, false) = false`,
    );
  }

  return whereClause;
}

async function fetchParticipantRows(
  filters: ParticipantListFilters,
): Promise<ParticipantRow[]> {
  const whereClause = await buildParticipantWhereClause(filters);
  const orderBy = buildParticipantOrderBy(filters.sort, filters.direction);
  const whereSql =
    whereClause.queryChunks.length > 0 ? sql`where ${whereClause}` : sql``;

  const result = await db.execute(sql`
    with latest_festivals as (
      select id
      from festivals
      where status in ('published', 'active', 'archived')
        and start_date <= now()
      order by start_date desc nulls last, id desc
      limit 3
    ),
    participant_activity as (
      select
        p.user_id,
        max(sr.updated_at) filter (where sr.status = 'accepted') as last_participation_at,
        count(*) filter (where sr.status = 'accepted') as accepted_participations_count,
        bool_or(
          sr.festival_id in (select id from latest_festivals)
          and sr.status = 'accepted'
        ) as participated_recently
      from participations p
      join stand_reservations sr on sr.id = p.reservation_id
      group by p.user_id
    ),
    terms_activity as (
      select
        ur.user_id,
        max(ur.created_at) filter (
          where ur.type = 'festival_participation' and ur.status = 'accepted'
        ) as last_terms_accepted_at,
        count(*) filter (
          where ur.type = 'festival_participation' and ur.status = 'accepted'
        ) as accepted_terms_count
      from user_requests ur
      group by ur.user_id
    ),
    last_participation_festival as (
      select distinct on (p.user_id)
        p.user_id,
        f.name as festival_name
      from participations p
      join stand_reservations sr on sr.id = p.reservation_id
      join festivals f on f.id = sr.festival_id
      where sr.status = 'accepted'
      order by p.user_id, sr.updated_at desc
    ),
    last_terms_festival as (
      select distinct on (ur.user_id)
        ur.user_id,
        f.name as festival_name
      from user_requests ur
      join festivals f on f.id = ur.festival_id
      where ur.type = 'festival_participation' and ur.status = 'accepted'
      order by ur.user_id, ur.created_at desc
    )
    select
      ${users.id},
      ${users.status},
      ${users.role},
      pa.last_participation_at,
      lpf.festival_name as last_participation_festival_name,
      ta.last_terms_accepted_at,
      ltf.festival_name as last_terms_accepted_festival_name,
      coalesce(pa.accepted_participations_count, 0)::int as accepted_participations_count,
      coalesce(ta.accepted_terms_count, 0)::int as accepted_terms_count,
      coalesce(pa.participated_recently, false) as participated_recently
    from ${users}
    left join participant_activity pa on pa.user_id = ${users.id}
    left join terms_activity ta on ta.user_id = ${users.id}
    left join last_participation_festival lpf on lpf.user_id = ${users.id}
    left join last_terms_festival ltf on ltf.user_id = ${users.id}
    ${whereSql}
    order by ${orderBy}
    limit ${filters.limit}
    offset ${filters.offset}
  `);

  return result.rows as unknown as ParticipantRow[];
}

function mapActivitySummary(row: ParticipantRow): ParticipantActivitySummary {
  const eligibility = getPauseEligibilityReason({
    status: row.status,
    role: row.role,
    participatedRecently: row.participated_recently,
  });

  return {
    lastParticipationAt: toActivityDate(row.last_participation_at),
    lastParticipationFestivalName: row.last_participation_festival_name,
    lastTermsAcceptedAt: toActivityDate(row.last_terms_accepted_at),
    lastTermsAcceptedFestivalName: row.last_terms_accepted_festival_name,
    acceptedParticipationsCount: row.accepted_participations_count,
    acceptedTermsCount: row.accepted_terms_count,
    isPauseEligible: eligibility.isPauseEligible,
    pauseEligibilityReason: eligibility.pauseEligibilityReason,
  };
}

export async function fetchParticipantProfiles(
  filters: ParticipantListFilters,
): Promise<ParticipantProfile[]> {
  try {
    const rows = await fetchParticipantRows(filters);
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const profiles = await db.query.users.findMany({
      with: {
        userRequests: true,
        userSocials: true,
        participations: {
          with: {
            reservation: {
              with: {
                stand: true,
                festival: true,
              },
            },
          },
        },
        profileTags: {
          with: {
            tag: true,
          },
        },
        profileSubcategories: {
          with: {
            subcategory: true,
          },
        },
      },
      where: inArray(users.id, ids),
    });

    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

    return rows
      .map((row) => {
        const profile = profileById.get(row.id);
        if (!profile) return null;

        return {
          ...profile,
          activitySummary: mapActivitySummary(row),
        } satisfies ParticipantProfile;
      })
      .filter((profile): profile is ParticipantProfile => profile !== null);
  } catch (error) {
    console.error("Error fetching participant profiles", error);
    return [];
  }
}

export async function fetchParticipantAggregates(
  filters: Omit<
    ParticipantListFilters,
    "limit" | "offset" | "sort" | "direction"
  >,
): Promise<ParticipantAggregates> {
  try {
    const filteredWhereClause = await buildParticipantWhereClause(filters);
    const summaryWhereClause = await buildParticipantWhereClause({
      ...filters,
      status: filterParticipantStatuses(),
      pauseEligible: undefined,
    });

    const filteredWhereSql =
      filteredWhereClause.queryChunks.length > 0
        ? sql`where ${filteredWhereClause}`
        : sql``;
    const summaryWhereSql =
      summaryWhereClause.queryChunks.length > 0
        ? sql`where ${summaryWhereClause}`
        : sql``;

    const activityCte = sql`
      with latest_festivals as (
        select id
        from festivals
        where status in ('published', 'active', 'archived')
          and start_date <= now()
        order by start_date desc nulls last, id desc
        limit 3
      ),
      participant_activity as (
        select
          p.user_id,
          bool_or(
            sr.festival_id in (select id from latest_festivals)
            and sr.status = 'accepted'
          ) as participated_recently
        from participations p
        join stand_reservations sr on sr.id = p.reservation_id
        group by p.user_id
      )
    `;

    const [filteredResult, summaryResult] = await Promise.all([
      db.execute(sql`
        ${activityCte}
        select count(*)::int as total
        from ${users}
        left join participant_activity pa on pa.user_id = ${users.id}
        ${filteredWhereSql}
      `),
      db.execute(sql`
        ${activityCte}
        select
          count(*)::int as historical_total,
          count(*) filter (where ${users.status} = 'verified')::int as active,
          count(*) filter (where ${users.status} = 'paused')::int as paused,
          count(*) filter (where ${users.status} = 'banned')::int as banned,
          count(*) filter (
            where ${users.status} = 'verified'
              and ${users.role} = 'user'
              and coalesce(pa.participated_recently, false) = false
          )::int as pause_eligible
        from ${users}
        left join participant_activity pa on pa.user_id = ${users.id}
        ${summaryWhereSql}
      `),
    ]);

    const filteredRow = filteredResult.rows[0] as { total: number };
    const summaryRow = summaryResult.rows[0] as {
      historical_total: number;
      active: number;
      paused: number;
      banned: number;
      pause_eligible: number;
    };

    return {
      total: filteredRow?.total ?? 0,
      active: summaryRow?.active ?? 0,
      paused: summaryRow?.paused ?? 0,
      banned: summaryRow?.banned ?? 0,
      totalParticipants: summaryRow?.historical_total ?? 0,
      pauseEligible: summaryRow?.pause_eligible ?? 0,
    };
  } catch (error) {
    console.error("Error fetching participant aggregates", error);
    return {
      total: 0,
      active: 0,
      paused: 0,
      banned: 0,
      totalParticipants: 0,
      pauseEligible: 0,
    };
  }
}

export async function checkPauseEligibility(profileId: number) {
  const result = await db.execute(sql`
    with latest_festivals as (
      select id
      from festivals
      where status in ('published', 'active', 'archived')
        and start_date <= now()
      order by start_date desc nulls last, id desc
      limit 3
    )
    select
      u.status,
      u.role,
      exists (
        select 1
        from participations p
        join stand_reservations sr on sr.id = p.reservation_id
        where p.user_id = u.id
          and sr.status = 'accepted'
          and sr.festival_id in (select id from latest_festivals)
      ) as participated_recently
    from users u
    where u.id = ${profileId}
    limit 1
  `);

  const row = result.rows[0] as
    | {
        status: BaseProfile["status"];
        role: BaseProfile["role"];
        participated_recently: boolean;
      }
    | undefined;

  if (!row) {
    return {
      isPauseEligible: false,
      pauseEligibilityReason: "Usuario no encontrado",
    };
  }

  return getPauseEligibilityReason({
    status: row.status,
    role: row.role,
    participatedRecently: row.participated_recently,
  });
}

type ActionResult = {
  success: boolean;
  message: string;
  description?: string;
};

function revalidateParticipantPaths(profileId: number) {
  revalidatePath("/dashboard/users");
  revalidatePath("/dashboard/profile_requests");
  revalidatePath(`/dashboard/users/${profileId}`);
  revalidatePath(`/profiles/${profileId}`);
  revalidatePath("/portal");
}

export async function pauseParticipantAccount(
  profileId: number,
  reason?: string,
): Promise<ActionResult> {
  const currentProfile = await getCurrentUserProfile();
  if (!currentProfile || currentProfile.role !== "admin") {
    return {
      success: false,
      message: "No tenés permisos para pausar participantes.",
    };
  }

  const targetProfile = await db.query.users.findFirst({
    where: eq(users.id, profileId),
  });

  if (!targetProfile) {
    return { success: false, message: "Participante no encontrado." };
  }

  if (targetProfile.status !== "verified") {
    return {
      success: false,
      message: "Solo se pueden pausar participantes verificados.",
    };
  }

  const eligibility = await checkPauseEligibility(profileId);
  if (!eligibility.isPauseEligible) {
    return {
      success: false,
      message: "Este participante no es elegible para pausa.",
      description: eligibility.pauseEligibilityReason,
    };
  }

  try {
    await db.transaction(async (tx) => {
      await updateUserStatusWithAudit(tx, {
        userId: profileId,
        fromStatus: targetProfile.status,
        toStatus: "paused",
        reason:
          reason?.trim() ||
          "Pausa manual por inactividad en los últimos 3 festivales.",
        createdByUserId: currentProfile.id,
      });
    });

    await sendEmail({
      to: [targetProfile.email],
      from: "Perfiles Glitter <perfiles@productoraglitter.com>",
      subject: "Tu cuenta de participante fue pausada",
      react: AccountPausedEmailTemplate({
        profile: targetProfile,
      }) as React.ReactElement,
    });
  } catch (error) {
    console.error("Error pausing participant account", error);
    return {
      success: false,
      message: "Error al pausar la cuenta del participante.",
    };
  }

  revalidateParticipantPaths(profileId);
  return {
    success: true,
    message: "Cuenta pausada correctamente.",
  };
}

export async function unpauseParticipantAccount(
  profileId: number,
  reason?: string,
): Promise<ActionResult> {
  const currentProfile = await getCurrentUserProfile();
  if (!currentProfile || currentProfile.role !== "admin") {
    return {
      success: false,
      message: "No tenés permisos para reactivar participantes.",
    };
  }

  const targetProfile = await db.query.users.findFirst({
    where: eq(users.id, profileId),
  });

  if (!targetProfile) {
    return { success: false, message: "Participante no encontrado." };
  }

  if (targetProfile.status !== "paused") {
    return {
      success: false,
      message: "Solo se pueden reactivar cuentas pausadas.",
    };
  }

  try {
    await db.transaction(async (tx) => {
      await updateUserStatusWithAudit(tx, {
        userId: profileId,
        fromStatus: targetProfile.status,
        toStatus: "verified",
        reason: reason?.trim() || "Reactivación manual por administrador.",
        createdByUserId: currentProfile.id,
      });
    });
  } catch (error) {
    console.error("Error unpausing participant account", error);
    return {
      success: false,
      message: "Error al reactivar la cuenta del participante.",
    };
  }

  revalidateParticipantPaths(profileId);
  return {
    success: true,
    message: "Cuenta reactivada correctamente.",
  };
}

export async function fetchParticipantActivitySummary(
  profileId: number,
): Promise<ParticipantActivitySummary | null> {
  const result = await db.execute(sql`
    with latest_festivals as (
      select id
      from festivals
      where status in ('published', 'active', 'archived')
        and start_date <= now()
      order by start_date desc nulls last, id desc
      limit 3
    ),
    participant_activity as (
      select
        p.user_id,
        max(sr.updated_at) filter (where sr.status = 'accepted') as last_participation_at,
        count(*) filter (where sr.status = 'accepted') as accepted_participations_count,
        bool_or(
          sr.festival_id in (select id from latest_festivals)
          and sr.status = 'accepted'
        ) as participated_recently
      from participations p
      join stand_reservations sr on sr.id = p.reservation_id
      where p.user_id = ${profileId}
      group by p.user_id
    ),
    terms_activity as (
      select
        ur.user_id,
        max(ur.created_at) filter (
          where ur.type = 'festival_participation' and ur.status = 'accepted'
        ) as last_terms_accepted_at,
        count(*) filter (
          where ur.type = 'festival_participation' and ur.status = 'accepted'
        ) as accepted_terms_count
      from user_requests ur
      where ur.user_id = ${profileId}
      group by ur.user_id
    ),
    last_participation_festival as (
      select distinct on (p.user_id)
        p.user_id,
        f.name as festival_name
      from participations p
      join stand_reservations sr on sr.id = p.reservation_id
      join festivals f on f.id = sr.festival_id
      where p.user_id = ${profileId} and sr.status = 'accepted'
      order by p.user_id, sr.updated_at desc
    ),
    last_terms_festival as (
      select distinct on (ur.user_id)
        ur.user_id,
        f.name as festival_name
      from user_requests ur
      join festivals f on f.id = ur.festival_id
      where ur.user_id = ${profileId}
        and ur.type = 'festival_participation'
        and ur.status = 'accepted'
      order by ur.user_id, ur.created_at desc
    )
    select
      ${users.status},
      ${users.role},
      pa.last_participation_at,
      lpf.festival_name as last_participation_festival_name,
      ta.last_terms_accepted_at,
      ltf.festival_name as last_terms_accepted_festival_name,
      coalesce(pa.accepted_participations_count, 0)::int as accepted_participations_count,
      coalesce(ta.accepted_terms_count, 0)::int as accepted_terms_count,
      coalesce(pa.participated_recently, false) as participated_recently
    from ${users}
    left join participant_activity pa on pa.user_id = ${users.id}
    left join terms_activity ta on ta.user_id = ${users.id}
    left join last_participation_festival lpf on lpf.user_id = ${users.id}
    left join last_terms_festival ltf on ltf.user_id = ${users.id}
    where ${users.id} = ${profileId}
    limit 1
  `);

  const row = result.rows[0] as ParticipantRow | undefined;
  if (!row) return null;

  return mapActivitySummary(row);
}

export async function fetchParticipantProfileById(
  profileId: number,
): Promise<ParticipantProfile | null> {
  const activitySummary = await fetchParticipantActivitySummary(profileId);
  if (!activitySummary) return null;

  const profile = await db.query.users.findFirst({
    with: {
      userRequests: true,
      userSocials: true,
      participations: {
        with: {
          reservation: {
            with: {
              stand: true,
              festival: true,
            },
          },
        },
      },
      profileTags: {
        with: {
          tag: true,
        },
      },
      profileSubcategories: {
        with: {
          subcategory: true,
        },
      },
    },
    where: eq(users.id, profileId),
  });

  if (!profile) return null;

  return {
    ...profile,
    activitySummary,
  };
}
