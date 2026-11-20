import "server-only";

import { and, asc, desc, eq, ilike, ne, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { buildSearchPattern } from "@/app/lib/programs/search";
import { getUserName } from "@/app/lib/users/utils";
import {
  VOLUNTEER_APPLICATION_STATUSES,
  type VolunteerAdminCall,
  type VolunteerApplicationDetail,
  type VolunteerApplicationsFilters,
  type VolunteerApplicationsPage,
} from "@/app/lib/volunteers/admin-definitions";
import type { VolunteerReferralSource } from "@/app/lib/volunteers/definitions";
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
 * full every shift is, the applications list and one application. Every read
 * is scoped by the festival; the pages check who is asking.
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

  const [settingsRows, roles, shifts] = await Promise.all([
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
      .orderBy(
        asc(volunteerShifts.sortOrder),
        asc(volunteerShifts.startsAt),
        asc(volunteerShifts.id),
      ),
  ]);

  return {
    festival,
    settings: settingsRows[0] ?? null,
    roles,
    shifts,
  };
}

const firstChoiceRole = alias(volunteerRoles, "first_choice_role");
const secondChoiceRole = alias(volunteerRoles, "second_choice_role");
const assignedRole = alias(volunteerRoles, "assigned_role");

/** Every filter but the status, which the counts ignore. */
function applicationConditions(
  festivalId: number,
  filters: VolunteerApplicationsFilters,
): SQL[] {
  const conditions: SQL[] = [eq(volunteerApplications.festivalId, festivalId)];

  const query = filters.query.trim();
  if (query) {
    const pattern = buildSearchPattern(query);
    conditions.push(
      or(
        ilike(volunteerApplications.fullName, pattern),
        ilike(volunteerApplications.email, pattern),
      )!,
    );
  }

  if (filters.roleId !== undefined) {
    conditions.push(
      or(
        eq(volunteerApplications.firstChoiceRoleId, filters.roleId),
        eq(volunteerApplications.secondChoiceRoleId, filters.roleId),
        eq(volunteerApplications.assignedRoleId, filters.roleId),
      )!,
    );
  }

  if (filters.shiftId !== undefined) {
    conditions.push(sql`(
      exists (
        select 1 from ${volunteerApplicationAvailableShifts}
        where ${volunteerApplicationAvailableShifts.applicationId} = ${volunteerApplications.id}
          and ${volunteerApplicationAvailableShifts.shiftId} = ${filters.shiftId}
      )
      or exists (
        select 1 from ${volunteerApplicationAssignedShifts}
        where ${volunteerApplicationAssignedShifts.applicationId} = ${volunteerApplications.id}
          and ${volunteerApplicationAssignedShifts.shiftId} = ${filters.shiftId}
      )
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
        status: volunteerApplications.status,
        firstChoiceRoleName: firstChoiceRole.name,
        secondChoiceRoleName: secondChoiceRole.name,
        assignedRoleName: assignedRole.name,
        availableShiftCount: sql<number>`(
          select count(*)::int from ${volunteerApplicationAvailableShifts}
          where ${volunteerApplicationAvailableShifts.applicationId} = ${volunteerApplications.id}
        )`.mapWith(Number),
        assignedShiftCount: sql<number>`(
          select count(*)::int from ${volunteerApplicationAssignedShifts}
          where ${volunteerApplicationAssignedShifts.applicationId} = ${volunteerApplications.id}
        )`.mapWith(Number),
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

  const counts = Object.fromEntries(
    VOLUNTEER_APPLICATION_STATUSES.map((status) => [status, 0]),
  ) as VolunteerApplicationsPage["counts"];
  counts.all = 0;
  for (const row of countRows) {
    counts[row.status] = row.total;
    counts.all += row.total;
  }

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
