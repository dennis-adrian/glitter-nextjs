import "server-only";

import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getUserName } from "@/app/lib/users/utils";
import type {
  VolunteerAdminCall,
  VolunteerShiftCoverage,
} from "@/app/lib/volunteers/admin-definitions";
import { fetchVolunteerAdminCall } from "@/app/lib/volunteers/admin-queries";
import type { VolunteerReviewSort } from "@/app/lib/volunteers/admin-tasks";
import { db } from "@/db";
import {
  users,
  volunteerApplicationAssignedShifts,
  volunteerApplicationAvailableShifts,
  volunteerApplicationNotes,
  volunteerApplications,
  volunteerRoles,
  volunteerShifts,
} from "@/db/schema";

/**
 * Reads for the volunteer admin by task (Revisar, Asignar): the call with the
 * extra counts those screens show, the pending applications in the review
 * order, the accepted people, and an application's notes. Every read is
 * scoped by the festival; the pages and actions check who is asking.
 */

export type VolunteerTaskShift = VolunteerShiftCoverage & {
  /** Accepted applications that marked it and are not assigned to it. */
  acceptedUnassignedCount: number;
  /** Pending applications that marked it. */
  pendingAvailableCount: number;
  /** Roles of the accepted people assigned to it, distinct. */
  assignedRoleIds: number[];
};

export type VolunteerTaskCall = Omit<VolunteerAdminCall, "shifts" | "roles"> & {
  shifts: VolunteerTaskShift[];
  roles: (VolunteerAdminCall["roles"][number] & {
    /** Accepted applications holding it as their assigned role. */
    acceptedCount: number;
  })[];
  /** Accepted applications with no assigned shift. */
  acceptedWithoutShifts: number;
};

/** The call, with what Revisar and Asignar count. Null without a festival. */
export async function fetchVolunteerTaskCall(
  festivalId: number,
): Promise<VolunteerTaskCall | null> {
  const call = await fetchVolunteerAdminCall(festivalId);
  if (!call) return null;

  const [shiftRows, roleShiftRows, roleRows, [withoutShifts]] =
    await Promise.all([
      db
        .select({
          shiftId: volunteerApplicationAvailableShifts.shiftId,
          acceptedUnassigned: sql<number>`(count(*) filter (
            where ${volunteerApplications.status} = 'accepted'
              and not exists (
                select 1 from ${volunteerApplicationAssignedShifts}
                where ${volunteerApplicationAssignedShifts.applicationId} =
                    ${volunteerApplicationAvailableShifts.applicationId}
                  and ${volunteerApplicationAssignedShifts.shiftId} =
                    ${volunteerApplicationAvailableShifts.shiftId}
              )
          ))::int`.mapWith(Number),
          pending: sql<number>`(count(*) filter (
            where ${volunteerApplications.status} = 'pending'
          ))::int`.mapWith(Number),
        })
        .from(volunteerApplicationAvailableShifts)
        .innerJoin(
          volunteerApplications,
          eq(
            volunteerApplications.id,
            volunteerApplicationAvailableShifts.applicationId,
          ),
        )
        .where(eq(volunteerApplicationAvailableShifts.festivalId, festivalId))
        .groupBy(volunteerApplicationAvailableShifts.shiftId),
      db
        .selectDistinct({
          shiftId: volunteerApplicationAssignedShifts.shiftId,
          roleId: volunteerApplications.assignedRoleId,
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
        ),
      db
        .select({
          roleId: volunteerApplications.assignedRoleId,
          total: sql<number>`count(*)::int`.mapWith(Number),
        })
        .from(volunteerApplications)
        .where(
          and(
            eq(volunteerApplications.festivalId, festivalId),
            eq(volunteerApplications.status, "accepted"),
          ),
        )
        .groupBy(volunteerApplications.assignedRoleId),
      db
        .select({ total: sql<number>`count(*)::int`.mapWith(Number) })
        .from(volunteerApplications)
        .where(
          and(
            eq(volunteerApplications.festivalId, festivalId),
            eq(volunteerApplications.status, "accepted"),
            sql`not exists (
              select 1 from ${volunteerApplicationAssignedShifts}
              where ${volunteerApplicationAssignedShifts.applicationId} = ${volunteerApplications.id}
            )`,
          ),
        ),
    ]);

  const byShift = new Map(shiftRows.map((row) => [row.shiftId, row]));
  const rolesByShift = new Map<number, number[]>();
  for (const row of roleShiftRows) {
    if (row.roleId === null) continue;
    rolesByShift.set(row.shiftId, [
      ...(rolesByShift.get(row.shiftId) ?? []),
      row.roleId,
    ]);
  }
  const acceptedByRole = new Map(
    roleRows.map((row) => [row.roleId, row.total]),
  );

  return {
    ...call,
    shifts: call.shifts.map((shift) => ({
      ...shift,
      acceptedUnassignedCount: byShift.get(shift.id)?.acceptedUnassigned ?? 0,
      pendingAvailableCount: byShift.get(shift.id)?.pending ?? 0,
      assignedRoleIds: rolesByShift.get(shift.id) ?? [],
    })),
    roles: call.roles.map((role) => ({
      ...role,
      acceptedCount: acceptedByRole.get(role.id) ?? 0,
    })),
    acceptedWithoutShifts: withoutShifts?.total ?? 0,
  };
}

/** The outer application's id inside a correlated subquery. */
const OUTER_APPLICATION_ID = sql.raw(`"volunteer_applications"."id"`);

/** Active shifts the application marked. */
const activeAvailableCountSql = sql<number>`(
  select count(*)::int
  from ${volunteerApplicationAvailableShifts}
  inner join ${volunteerShifts}
    on ${volunteerShifts.id} = ${volunteerApplicationAvailableShifts.shiftId}
  where ${volunteerApplicationAvailableShifts.applicationId} = ${OUTER_APPLICATION_ID}
    and ${volunteerShifts.isActive}
)`.mapWith(Number);

function idArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(Number);
}

const availableShiftIdsSql = sql<number[]>`coalesce((
  select array_agg(${volunteerApplicationAvailableShifts.shiftId} order by ${volunteerApplicationAvailableShifts.shiftId})
  from ${volunteerApplicationAvailableShifts}
  where ${volunteerApplicationAvailableShifts.applicationId} = ${OUTER_APPLICATION_ID}
), '{}'::int[])`.mapWith(idArray);

const assignedShiftIdsSql = sql<number[]>`coalesce((
  select array_agg(${volunteerApplicationAssignedShifts.shiftId} order by ${volunteerApplicationAssignedShifts.shiftId})
  from ${volunteerApplicationAssignedShifts}
  where ${volunteerApplicationAssignedShifts.applicationId} = ${OUTER_APPLICATION_ID}
), '{}'::int[])`.mapWith(idArray);

const hasAssignedShiftSql = sql<boolean>`exists (
  select 1 from ${volunteerApplicationAssignedShifts}
  where ${volunteerApplicationAssignedShifts.applicationId} = ${OUTER_APPLICATION_ID}
)`;

const firstChoiceRole = alias(volunteerRoles, "first_choice_role");
const assignedRole = alias(volunteerRoles, "assigned_role");

function reviewOrder(sort: VolunteerReviewSort): SQL[] {
  switch (sort) {
    case "nuevas":
      return [
        desc(volunteerApplications.createdAt),
        desc(volunteerApplications.id),
      ];
    case "turnos":
      return [
        desc(activeAvailableCountSql),
        asc(volunteerApplications.createdAt),
        asc(volunteerApplications.id),
      ];
    case "antiguas":
      return [
        asc(volunteerApplications.createdAt),
        asc(volunteerApplications.id),
      ];
  }
}

const pendingOf = (festivalId: number) =>
  and(
    eq(volunteerApplications.festivalId, festivalId),
    eq(volunteerApplications.status, "pending"),
  );

/** Every pending application's id, in the review order. */
export async function fetchPendingReviewIds(
  festivalId: number,
  sort: VolunteerReviewSort,
): Promise<number[]> {
  const rows = await db
    .select({ id: volunteerApplications.id })
    .from(volunteerApplications)
    .where(pendingOf(festivalId))
    .orderBy(...reviewOrder(sort));
  return rows.map((row) => row.id);
}

export type VolunteerReviewItem = {
  id: number;
  fullName: string;
  /** yyyy-MM-dd */
  birthdate: string;
  motivation: string;
  firstChoiceRoleName: string;
  /** Active shifts they marked. */
  availableCount: number;
};

/** One batch of Revisar's list. */
export async function fetchPendingReviewPage(
  festivalId: number,
  sort: VolunteerReviewSort,
  offset: number,
  limit: number,
): Promise<VolunteerReviewItem[]> {
  return db
    .select({
      id: volunteerApplications.id,
      fullName: volunteerApplications.fullName,
      birthdate: volunteerApplications.birthdate,
      motivation: volunteerApplications.motivation,
      firstChoiceRoleName: firstChoiceRole.name,
      availableCount: activeAvailableCountSql,
    })
    .from(volunteerApplications)
    .innerJoin(
      firstChoiceRole,
      eq(firstChoiceRole.id, volunteerApplications.firstChoiceRoleId),
    )
    .where(pendingOf(festivalId))
    .orderBy(...reviewOrder(sort))
    .limit(limit)
    .offset(offset);
}

/** Accepted people: those without shifts first, then by name. */
function peopleOrder(): SQL[] {
  return [
    asc(hasAssignedShiftSql),
    asc(sql`lower(${volunteerApplications.fullName})`),
    asc(volunteerApplications.id),
  ];
}

const acceptedOf = (festivalId: number) =>
  and(
    eq(volunteerApplications.festivalId, festivalId),
    eq(volunteerApplications.status, "accepted"),
  );

/**
 * Accepted ids in "Por persona" order; only those without shifts when
 * `withoutShifts` is set.
 */
export async function fetchAcceptedPeopleIds(
  festivalId: number,
  { withoutShifts = false }: { withoutShifts?: boolean } = {},
): Promise<number[]> {
  const rows = await db
    .select({ id: volunteerApplications.id })
    .from(volunteerApplications)
    .where(
      withoutShifts
        ? and(acceptedOf(festivalId), sql`not ${hasAssignedShiftSql}`)
        : acceptedOf(festivalId),
    )
    .orderBy(...peopleOrder());
  return rows.map((row) => row.id);
}

export type VolunteerPersonItem = {
  id: number;
  fullName: string;
  firstChoiceRoleName: string;
  assignedRoleName: string | null;
  availableShiftIds: number[];
  assignedShiftIds: number[];
};

/** One batch of "Por persona". */
export async function fetchAcceptedPeoplePage(
  festivalId: number,
  offset: number,
  limit: number,
): Promise<VolunteerPersonItem[]> {
  return db
    .select({
      id: volunteerApplications.id,
      fullName: volunteerApplications.fullName,
      firstChoiceRoleName: firstChoiceRole.name,
      assignedRoleName: assignedRole.name,
      availableShiftIds: availableShiftIdsSql,
      assignedShiftIds: assignedShiftIdsSql,
    })
    .from(volunteerApplications)
    .innerJoin(
      firstChoiceRole,
      eq(firstChoiceRole.id, volunteerApplications.firstChoiceRoleId),
    )
    .leftJoin(
      assignedRole,
      eq(assignedRole.id, volunteerApplications.assignedRoleId),
    )
    .where(acceptedOf(festivalId))
    .orderBy(...peopleOrder())
    .limit(limit)
    .offset(offset);
}

export type VolunteerNote = {
  id: number;
  body: string;
  /** Null for a note whose author was deleted. */
  authorName: string | null;
  createdAt: Date;
};

/** An application's notes, oldest first. */
export async function fetchVolunteerNotes(
  festivalId: number,
  applicationId: number,
): Promise<VolunteerNote[]> {
  const rows = await db
    .select({
      id: volunteerApplicationNotes.id,
      body: volunteerApplicationNotes.body,
      createdAt: volunteerApplicationNotes.createdAt,
      author: {
        id: users.id,
        displayName: users.displayName,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
    })
    .from(volunteerApplicationNotes)
    .leftJoin(users, eq(users.id, volunteerApplicationNotes.authorUserId))
    .where(
      and(
        eq(volunteerApplicationNotes.applicationId, applicationId),
        eq(volunteerApplicationNotes.festivalId, festivalId),
      ),
    )
    .orderBy(
      asc(volunteerApplicationNotes.createdAt),
      asc(volunteerApplicationNotes.id),
    );
  return rows.map(({ author, ...note }) => ({
    ...note,
    authorName: author ? getUserName(author) || author.email : null,
  }));
}

/** The shifts an admin added to the application (not marked on the form). */
export async function fetchAdminAddedShiftIds(
  festivalId: number,
  applicationId: number,
): Promise<number[]> {
  const rows = await db
    .select({ shiftId: volunteerApplicationAvailableShifts.shiftId })
    .from(volunteerApplicationAvailableShifts)
    .where(
      and(
        eq(volunteerApplicationAvailableShifts.applicationId, applicationId),
        eq(volunteerApplicationAvailableShifts.festivalId, festivalId),
        eq(volunteerApplicationAvailableShifts.addedByAdmin, true),
      ),
    );
  return rows.map((row) => row.shiftId);
}

/**
 * The other shifts each of `applicationIds` holds, with their starts, to
 * count them per day on the shift screen.
 */
export async function fetchHeldShiftStarts(
  festivalId: number,
  applicationIds: number[],
): Promise<Map<number, Date[]>> {
  const held = new Map<number, Date[]>();
  if (applicationIds.length === 0) return held;
  const rows = await db
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
          applicationIds,
        ),
      ),
    );
  for (const row of rows) {
    held.set(row.applicationId, [
      ...(held.get(row.applicationId) ?? []),
      row.startsAt,
    ]);
  }
  return held;
}
