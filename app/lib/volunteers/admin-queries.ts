import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DateTime } from "luxon";

import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { buildSearchPattern } from "@/app/lib/programs/search";
import { getUserName } from "@/app/lib/users/utils";
import {
  VOLUNTEER_APPLICATION_STATUSES,
  type VolunteerAdminCall,
  type VolunteerApplicationDetail,
  type VolunteerApplicationsFilters,
  type VolunteerApplicationsPage,
  type VolunteerShiftCandidate,
  type VolunteerShiftDetail,
} from "@/app/lib/volunteers/admin-definitions";
import type { VolunteerExport } from "@/app/lib/volunteers/admin-export";
import type {
  VolunteerApplicationStatus,
  VolunteerReferralSource,
} from "@/app/lib/volunteers/definitions";
import { db } from "@/db";
import {
  festivals,
  users,
  volunteerApplicationAssignedShifts,
  volunteerApplicationAvailableShifts,
  volunteerApplications,
  volunteerCallSettings,
  volunteerRoles,
  volunteerShifts,
} from "@/db/schema";

/**
 * Admin reads for a festival's volunteer call: its configuration with how
 * full every shift is, the applications list, one application, one shift's
 * screen and the CSV export. Every read is scoped by the festival; the pages
 * check who is asking.
 *
 * Unlike the public reads (queries.ts), roles and shifts come back active and
 * inactive alike: the admin reactivates them and applications keep naming
 * the ones deactivated since.
 */

/**
 * The festival's call: settings (null until configured), every role and every
 * shift with its coverage. Null when the festival does not exist.
 */
export async function fetchVolunteerAdminCall(
  festivalId: number,
): Promise<VolunteerAdminCall | null> {
  const [festival] = await db
    .select({ id: festivals.id, name: festivals.name })
    .from(festivals)
    .where(eq(festivals.id, festivalId))
    .limit(1);
  if (!festival) return null;

  // Rejected applicants are not a pool to draw from.
  const availableByShift = db
    .select({
      shiftId: volunteerApplicationAvailableShifts.shiftId,
      total: sql<number>`count(*)::int`.as("available_total"),
    })
    .from(volunteerApplicationAvailableShifts)
    .innerJoin(
      volunteerApplications,
      eq(
        volunteerApplications.id,
        volunteerApplicationAvailableShifts.applicationId,
      ),
    )
    .where(
      and(
        eq(volunteerApplicationAvailableShifts.festivalId, festivalId),
        ne(volunteerApplications.status, "rejected"),
      ),
    )
    .groupBy(volunteerApplicationAvailableShifts.shiftId)
    .as("available_by_shift");
  // An assignment outlives a status change; only accepted ones count.
  const assignedByShift = db
    .select({
      shiftId: volunteerApplicationAssignedShifts.shiftId,
      total: sql<number>`count(*)::int`.as("assigned_total"),
    })
    .from(volunteerApplicationAssignedShifts)
    .innerJoin(
      volunteerApplications,
      eq(
        volunteerApplications.id,
        volunteerApplicationAssignedShifts.applicationId,
      ),
    )
    .where(
      and(
        eq(volunteerApplicationAssignedShifts.festivalId, festivalId),
        eq(volunteerApplications.status, "accepted"),
      ),
    )
    .groupBy(volunteerApplicationAssignedShifts.shiftId)
    .as("assigned_by_shift");

  const [settingsRows, roles, shifts, statusRows] = await Promise.all([
    db
      .select({
        applicationsCloseAt: volunteerCallSettings.applicationsCloseAt,
        inductionDate: volunteerCallSettings.inductionDate,
        inductionTime: volunteerCallSettings.inductionTime,
      })
      .from(volunteerCallSettings)
      .where(eq(volunteerCallSettings.festivalId, festivalId))
      .limit(1),
    db
      .select({
        id: volunteerRoles.id,
        name: volunteerRoles.name,
        description: volunteerRoles.description,
        sortOrder: volunteerRoles.sortOrder,
        isActive: volunteerRoles.isActive,
        choiceCount: sql<number>`(
          select count(*)::int from ${volunteerApplications}
          where ${volunteerApplications.festivalId} = ${festivalId}
            and ${OUTER_ROLE_ID} in (
              ${volunteerApplications.firstChoiceRoleId},
              ${volunteerApplications.secondChoiceRoleId}
            )
        )`.mapWith(Number),
      })
      .from(volunteerRoles)
      .where(eq(volunteerRoles.festivalId, festivalId))
      .orderBy(asc(volunteerRoles.sortOrder), asc(volunteerRoles.id)),
    db
      .select({
        id: volunteerShifts.id,
        label: volunteerShifts.label,
        startsAt: volunteerShifts.startsAt,
        endsAt: volunteerShifts.endsAt,
        neededHeadcount: volunteerShifts.neededHeadcount,
        sortOrder: volunteerShifts.sortOrder,
        isActive: volunteerShifts.isActive,
        availableCount:
          sql<number>`coalesce(${availableByShift.total}, 0)`.mapWith(Number),
        assignedCount:
          sql<number>`coalesce(${assignedByShift.total}, 0)`.mapWith(Number),
      })
      .from(volunteerShifts)
      .leftJoin(
        availableByShift,
        eq(availableByShift.shiftId, volunteerShifts.id),
      )
      .leftJoin(
        assignedByShift,
        eq(assignedByShift.shiftId, volunteerShifts.id),
      )
      .where(eq(volunteerShifts.festivalId, festivalId))
      // Chronological, as the admin and the public page list them.
      .orderBy(asc(volunteerShifts.startsAt), asc(volunteerShifts.id)),
    db
      .select({
        status: volunteerApplications.status,
        total: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(volunteerApplications)
      .where(eq(volunteerApplications.festivalId, festivalId))
      .groupBy(volunteerApplications.status),
  ]);

  return {
    festival,
    settings: settingsRows[0] ?? null,
    roles,
    shifts,
    statusTotals: tallyStatuses(statusRows),
  };
}

/** Per-status counts, every status present, plus their sum as `all`. */
function tallyStatuses(
  rows: ReadonlyArray<{ status: VolunteerApplicationStatus; total: number }>,
): Record<VolunteerApplicationStatus, number> & { all: number } {
  const counts = Object.fromEntries(
    VOLUNTEER_APPLICATION_STATUSES.map((status) => [status, 0]),
  ) as Record<VolunteerApplicationStatus, number> & { all: number };
  counts.all = 0;
  for (const row of rows) {
    counts[row.status] = row.total;
    counts.all += row.total;
  }
  return counts;
}

/**
 * The outer row's id inside a correlated subquery. Drizzle leaves columns
 * unqualified in a select without joins, where `id` would resolve to the
 * subquery's own table; these constants always name the outer table.
 */
const OUTER_ROLE_ID = sql.raw(`"volunteer_roles"."id"`);
const OUTER_APPLICATION_ID = sql.raw(`"volunteer_applications"."id"`);

/** Postgres int[] as numbers, [] for null (no rows to aggregate). */
function idArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(Number);
}

/** The application's marked shift ids, ascending. */
const availableShiftIdsSql = sql<number[]>`coalesce((
  select array_agg(${volunteerApplicationAvailableShifts.shiftId} order by ${volunteerApplicationAvailableShifts.shiftId})
  from ${volunteerApplicationAvailableShifts}
  where ${volunteerApplicationAvailableShifts.applicationId} = ${OUTER_APPLICATION_ID}
), '{}'::int[])`.mapWith(idArray);

/** The application's assigned shift ids, ascending. */
const assignedShiftIdsSql = sql<number[]>`coalesce((
  select array_agg(${volunteerApplicationAssignedShifts.shiftId} order by ${volunteerApplicationAssignedShifts.shiftId})
  from ${volunteerApplicationAssignedShifts}
  where ${volunteerApplicationAssignedShifts.applicationId} = ${OUTER_APPLICATION_ID}
), '{}'::int[])`.mapWith(idArray);

const firstChoiceRole = alias(volunteerRoles, "first_choice_role");
const secondChoiceRole = alias(volunteerRoles, "second_choice_role");
const assignedRole = alias(volunteerRoles, "assigned_role");

/** A search with fewer digits than this does not look at phones. */
const PHONE_SEARCH_MIN_DIGITS = 3;

/** Every filter but the status, which the counts ignore. */
function applicationConditions(
  festivalId: number,
  filters: VolunteerApplicationsFilters,
): SQL[] {
  const conditions: SQL[] = [eq(volunteerApplications.festivalId, festivalId)];

  const query = filters.query.trim();
  if (query) {
    const pattern = buildSearchPattern(query);
    const matches: SQL[] = [
      ilike(volunteerApplications.fullName, pattern),
      ilike(volunteerApplications.email, pattern),
    ];
    // "70000001", "+591 7000-0001" or "7000 0001" all find the stored phone.
    const digits = query.replace(/\D/g, "");
    if (digits.length >= PHONE_SEARCH_MIN_DIGITS) {
      matches.push(
        sql`regexp_replace(${volunteerApplications.phone}, '\\D', '', 'g') like ${`%${digits}%`}`,
      );
    }
    conditions.push(or(...matches)!);
  }

  // "Rol preferido": their 1st or 2nd choice, not the assigned role.
  if (filters.roleId !== undefined) {
    conditions.push(
      or(
        eq(volunteerApplications.firstChoiceRoleId, filters.roleId),
        eq(volunteerApplications.secondChoiceRoleId, filters.roleId),
      )!,
    );
  }

  // "Turno disponible": a shift they marked, not one they were assigned.
  if (filters.shiftId !== undefined) {
    conditions.push(sql`exists (
      select 1 from ${volunteerApplicationAvailableShifts}
      where ${volunteerApplicationAvailableShifts.applicationId} = ${volunteerApplications.id}
        and ${volunteerApplicationAvailableShifts.shiftId} = ${filters.shiftId}
    )`);
  }

  return conditions;
}

/**
 * One page of the festival's applications, newest first, with how many there
 * are per status under the same search, role and shift filters.
 */
export async function fetchVolunteerApplicationsPage(
  festivalId: number,
  filters: VolunteerApplicationsFilters,
): Promise<VolunteerApplicationsPage> {
  const conditions = applicationConditions(festivalId, filters);
  const listConditions =
    filters.status === "all"
      ? conditions
      : [...conditions, eq(volunteerApplications.status, filters.status)];

  const [items, countRows] = await Promise.all([
    db
      .select({
        id: volunteerApplications.id,
        fullName: volunteerApplications.fullName,
        email: volunteerApplications.email,
        phone: volunteerApplications.phone,
        birthdate: volunteerApplications.birthdate,
        status: volunteerApplications.status,
        firstChoiceRoleId: volunteerApplications.firstChoiceRoleId,
        secondChoiceRoleId: volunteerApplications.secondChoiceRoleId,
        assignedRoleId: volunteerApplications.assignedRoleId,
        firstChoiceRoleName: firstChoiceRole.name,
        secondChoiceRoleName: secondChoiceRole.name,
        assignedRoleName: assignedRole.name,
        availableShiftIds: availableShiftIdsSql,
        assignedShiftIds: assignedShiftIdsSql,
        createdAt: volunteerApplications.createdAt,
      })
      .from(volunteerApplications)
      .innerJoin(
        firstChoiceRole,
        eq(firstChoiceRole.id, volunteerApplications.firstChoiceRoleId),
      )
      .innerJoin(
        secondChoiceRole,
        eq(secondChoiceRole.id, volunteerApplications.secondChoiceRoleId),
      )
      .leftJoin(
        assignedRole,
        eq(assignedRole.id, volunteerApplications.assignedRoleId),
      )
      .where(and(...listConditions))
      .orderBy(
        desc(volunteerApplications.createdAt),
        desc(volunteerApplications.id),
      )
      .limit(filters.limit)
      .offset(filters.offset),
    db
      .select({
        status: volunteerApplications.status,
        total: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(volunteerApplications)
      .where(and(...conditions))
      .groupBy(volunteerApplications.status),
  ]);

  const counts = tallyStatuses(countRows);

  return {
    items,
    total: counts[filters.status],
    counts,
  };
}

/** One application of the festival, with who last reviewed it. */
export async function fetchVolunteerApplicationDetail(
  festivalId: number,
  applicationId: number,
): Promise<VolunteerApplicationDetail | null> {
  const [row] = await db
    .select({
      application: volunteerApplications,
      reviewer: {
        id: users.id,
        displayName: users.displayName,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
    })
    .from(volunteerApplications)
    .leftJoin(users, eq(users.id, volunteerApplications.reviewedByUserId))
    .where(
      and(
        eq(volunteerApplications.id, applicationId),
        eq(volunteerApplications.festivalId, festivalId),
      ),
    )
    .limit(1);
  if (!row) return null;

  const [available, assigned] = await Promise.all([
    db
      .select({ shiftId: volunteerApplicationAvailableShifts.shiftId })
      .from(volunteerApplicationAvailableShifts)
      .where(
        and(
          eq(volunteerApplicationAvailableShifts.applicationId, applicationId),
          eq(volunteerApplicationAvailableShifts.festivalId, festivalId),
        ),
      )
      .orderBy(asc(volunteerApplicationAvailableShifts.shiftId)),
    db
      .select({ shiftId: volunteerApplicationAssignedShifts.shiftId })
      .from(volunteerApplicationAssignedShifts)
      .where(
        and(
          eq(volunteerApplicationAssignedShifts.applicationId, applicationId),
          eq(volunteerApplicationAssignedShifts.festivalId, festivalId),
        ),
      )
      .orderBy(asc(volunteerApplicationAssignedShifts.shiftId)),
  ]);

  const { application, reviewer } = row;
  return {
    id: application.id,
    festivalId: application.festivalId,
    fullName: application.fullName,
    birthdate: application.birthdate,
    phone: application.phone,
    email: application.email,
    zone: application.zone,
    firstChoiceRoleId: application.firstChoiceRoleId,
    secondChoiceRoleId: application.secondChoiceRoleId,
    experience: application.experience,
    experienceNotes: application.experienceNotes,
    portfolio: application.portfolio,
    motivation: application.motivation,
    emergencyContactName: application.emergencyContactName,
    emergencyContactPhone: application.emergencyContactPhone,
    referralSource: application.referralSource as VolunteerReferralSource,
    consentedAt: application.consentedAt,
    privacyNoticeVersion: application.privacyNoticeVersion,
    imageConsent: application.imageConsent,
    status: application.status,
    assignedRoleId: application.assignedRoleId,
    adminNotes: application.adminNotes,
    availableShiftIds: available.map((shift) => shift.shiftId),
    assignedShiftIds: assigned.map((shift) => shift.shiftId),
    reviewedBy: reviewer
      ? {
          id: reviewer.id,
          displayName: getUserName(reviewer) || reviewer.email,
        }
      : null,
    reviewedAt: application.reviewedAt,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
}

function laPazDay(date: Date) {
  return DateTime.fromJSDate(date, { zone: STORE_TIMEZONE }).toISODate();
}

const byName = new Intl.Collator("es", { sensitivity: "base" });

const CANDIDATE_STATUS_ORDER: Record<
  VolunteerShiftCandidate["status"],
  number
> = { accepted: 0, pending: 1, waitlist: 2 };

/**
 * One shift of the festival for its screen: its coverage (counted as
 * fetchVolunteerAdminCall counts it), everyone assigned to it, whatever their
 * status, and who could cover it: people who marked it, are not assigned to
 * it and are not rejected, with how many other shifts they hold that La Paz
 * day. Null when the shift is not this festival's.
 */
export async function fetchVolunteerShiftDetail(
  festivalId: number,
  shiftId: number,
): Promise<VolunteerShiftDetail | null> {
  const [row] = await db
    .select({
      festival: { id: festivals.id, name: festivals.name },
      shift: {
        id: volunteerShifts.id,
        label: volunteerShifts.label,
        startsAt: volunteerShifts.startsAt,
        endsAt: volunteerShifts.endsAt,
        neededHeadcount: volunteerShifts.neededHeadcount,
        sortOrder: volunteerShifts.sortOrder,
        isActive: volunteerShifts.isActive,
      },
    })
    .from(volunteerShifts)
    .innerJoin(festivals, eq(festivals.id, volunteerShifts.festivalId))
    .where(
      and(
        eq(volunteerShifts.id, shiftId),
        eq(volunteerShifts.festivalId, festivalId),
      ),
    )
    .limit(1);
  if (!row) return null;

  const [assigneeRows, markedRows] = await Promise.all([
    db
      .select({
        applicationId: volunteerApplications.id,
        fullName: volunteerApplications.fullName,
        status: volunteerApplications.status,
        assignedRoleName: assignedRole.name,
      })
      .from(volunteerApplicationAssignedShifts)
      .innerJoin(
        volunteerApplications,
        eq(
          volunteerApplications.id,
          volunteerApplicationAssignedShifts.applicationId,
        ),
      )
      .leftJoin(
        assignedRole,
        eq(assignedRole.id, volunteerApplications.assignedRoleId),
      )
      .where(
        and(
          eq(volunteerApplicationAssignedShifts.shiftId, shiftId),
          eq(volunteerApplicationAssignedShifts.festivalId, festivalId),
        ),
      ),
    // Rejected applicants are not a pool to draw from.
    db
      .select({
        applicationId: volunteerApplications.id,
        fullName: volunteerApplications.fullName,
        status: volunteerApplications.status,
        firstChoiceRoleName: firstChoiceRole.name,
        secondChoiceRoleName: secondChoiceRole.name,
      })
      .from(volunteerApplicationAvailableShifts)
      .innerJoin(
        volunteerApplications,
        eq(
          volunteerApplications.id,
          volunteerApplicationAvailableShifts.applicationId,
        ),
      )
      .innerJoin(
        firstChoiceRole,
        eq(firstChoiceRole.id, volunteerApplications.firstChoiceRoleId),
      )
      .innerJoin(
        secondChoiceRole,
        eq(secondChoiceRole.id, volunteerApplications.secondChoiceRoleId),
      )
      .where(
        and(
          eq(volunteerApplicationAvailableShifts.shiftId, shiftId),
          eq(volunteerApplicationAvailableShifts.festivalId, festivalId),
          ne(volunteerApplications.status, "rejected"),
        ),
      ),
  ]);

  const assignedIds = new Set(assigneeRows.map((a) => a.applicationId));
  const candidateRows = markedRows.filter(
    (marked) => !assignedIds.has(marked.applicationId),
  );

  // Their other assignments, to count the ones on this shift's day.
  const day = laPazDay(row.shift.startsAt);
  const otherAssignments =
    candidateRows.length === 0
      ? []
      : await db
          .select({
            applicationId: volunteerApplicationAssignedShifts.applicationId,
            startsAt: volunteerShifts.startsAt,
          })
          .from(volunteerApplicationAssignedShifts)
          .innerJoin(
            volunteerShifts,
            eq(volunteerShifts.id, volunteerApplicationAssignedShifts.shiftId),
          )
          .where(
            and(
              eq(volunteerApplicationAssignedShifts.festivalId, festivalId),
              inArray(
                volunteerApplicationAssignedShifts.applicationId,
                candidateRows.map((candidate) => candidate.applicationId),
              ),
            ),
          );
  const shiftsThatDay = new Map<number, number>();
  for (const assignment of otherAssignments) {
    if (laPazDay(assignment.startsAt) !== day) continue;
    shiftsThatDay.set(
      assignment.applicationId,
      (shiftsThatDay.get(assignment.applicationId) ?? 0) + 1,
    );
  }

  const candidates: VolunteerShiftCandidate[] = candidateRows
    .map((candidate) => ({
      ...candidate,
      status: candidate.status as VolunteerShiftCandidate["status"],
      shiftsThatDay: shiftsThatDay.get(candidate.applicationId) ?? 0,
    }))
    .sort(
      (a, b) =>
        CANDIDATE_STATUS_ORDER[a.status] - CANDIDATE_STATUS_ORDER[b.status] ||
        byName.compare(a.fullName, b.fullName) ||
        a.applicationId - b.applicationId,
    );
  const assignees = [...assigneeRows].sort(
    (a, b) =>
      byName.compare(a.fullName, b.fullName) ||
      a.applicationId - b.applicationId,
  );

  return {
    festival: row.festival,
    shift: {
      ...row.shift,
      // As fetchVolunteerAdminCall: marked and not rejected; assigned and
      // accepted (an assignment outlives a status change).
      availableCount: markedRows.length,
      assignedCount: assigneeRows.filter(
        (assignee) => assignee.status === "accepted",
      ).length,
    },
    assignees,
    candidates,
  };
}

/**
 * Everything the CSV export needs: the festival, its shifts (to name the
 * ones each application marked or was given) and every application, newest
 * first. Null when the festival does not exist.
 */
export async function fetchVolunteerApplicationsForExport(
  festivalId: number,
): Promise<VolunteerExport | null> {
  const [festival] = await db
    .select({ id: festivals.id, name: festivals.name })
    .from(festivals)
    .where(eq(festivals.id, festivalId))
    .limit(1);
  if (!festival) return null;

  const [shifts, applications] = await Promise.all([
    db
      .select({
        id: volunteerShifts.id,
        label: volunteerShifts.label,
        startsAt: volunteerShifts.startsAt,
        endsAt: volunteerShifts.endsAt,
      })
      .from(volunteerShifts)
      .where(eq(volunteerShifts.festivalId, festivalId))
      .orderBy(asc(volunteerShifts.startsAt), asc(volunteerShifts.id)),
    db
      .select({
        id: volunteerApplications.id,
        fullName: volunteerApplications.fullName,
        status: volunteerApplications.status,
        phone: volunteerApplications.phone,
        email: volunteerApplications.email,
        birthdate: volunteerApplications.birthdate,
        zone: volunteerApplications.zone,
        firstChoiceRoleName: firstChoiceRole.name,
        secondChoiceRoleName: secondChoiceRole.name,
        assignedRoleName: assignedRole.name,
        availableShiftIds: availableShiftIdsSql,
        assignedShiftIds: assignedShiftIdsSql,
        experience: volunteerApplications.experience,
        experienceNotes: volunteerApplications.experienceNotes,
        portfolio: volunteerApplications.portfolio,
        motivation: volunteerApplications.motivation,
        emergencyContactName: volunteerApplications.emergencyContactName,
        emergencyContactPhone: volunteerApplications.emergencyContactPhone,
        referralSource: volunteerApplications.referralSource,
        imageConsent: volunteerApplications.imageConsent,
        adminNotes: volunteerApplications.adminNotes,
        createdAt: volunteerApplications.createdAt,
      })
      .from(volunteerApplications)
      .innerJoin(
        firstChoiceRole,
        eq(firstChoiceRole.id, volunteerApplications.firstChoiceRoleId),
      )
      .innerJoin(
        secondChoiceRole,
        eq(secondChoiceRole.id, volunteerApplications.secondChoiceRoleId),
      )
      .leftJoin(
        assignedRole,
        eq(assignedRole.id, volunteerApplications.assignedRoleId),
      )
      .where(eq(volunteerApplications.festivalId, festivalId))
      .orderBy(
        desc(volunteerApplications.createdAt),
        desc(volunteerApplications.id),
      ),
  ]);

  return {
    festival,
    shifts,
    applications: applications.map((application) => ({
      ...application,
      referralSource: application.referralSource as VolunteerReferralSource,
    })),
  };
}
