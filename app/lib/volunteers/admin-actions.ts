"use server";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { revalidatePath } from "next/cache";

import { loggableError } from "@/app/lib/errors/loggable-error";
import { isUniqueViolationOn } from "@/app/lib/errors/postgres";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { IMPERSONATION_READ_ONLY_RESULT } from "@/app/lib/impersonation/definitions";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import {
  canAssignVolunteer,
  daysOverShiftLimit,
  decideShiftAssignment,
  defaultAssignedRoleId,
  VOLUNTEER_ADMIN_COPY,
  VOLUNTEER_STATUS_LABELS,
  type VolunteerAdminResult,
  volunteerAdminPath,
} from "@/app/lib/volunteers/admin-definitions";
import {
  type VolunteerActiveInput,
  volunteerActiveInputSchema,
  type VolunteerCallSettingsInput,
  volunteerCallSettingsInputSchema,
  type VolunteerReviewInput,
  volunteerReviewInputSchema,
  type VolunteerRoleInput,
  volunteerRoleInputSchema,
  type VolunteerRoleMoveInput,
  volunteerRoleMoveInputSchema,
  type VolunteerShiftAssignmentInput,
  volunteerShiftAssignmentInputSchema,
  type VolunteerShiftInput,
  volunteerShiftInputSchema,
  type VolunteerStatusInput,
  volunteerStatusInputSchema,
} from "@/app/lib/volunteers/admin-schema";
import {
  VOLUNTEER_MAX_SHIFTS_PER_DAY,
  VOLUNTEERS_PATH,
} from "@/app/lib/volunteers/definitions";
import { db } from "@/db";
import { isImpersonationReadOnlyError } from "@/db/write-guard";
import {
  festivals,
  volunteerApplicationAssignedShifts,
  volunteerApplications,
  volunteerCallSettings,
  volunteerRoles,
  volunteerShifts,
} from "@/db/schema";

/**
 * The volunteer admin's writes. Admins and festival admins alike; every write
 * is scoped by the row's id AND the festival in the URL, so an id from another
 * festival finds nothing. Applicants hear about decisions over WhatsApp, so
 * nothing here sends email.
 *
 * Applications hold strangers' personal data: errors are logged only through
 * `loggableError`, never as they come (drizzle's carry the query's params).
 */

const FESTIVAL_NOT_FOUND = "No encontramos ese festival. Actualizá la página.";
const ROLE_NOT_FOUND = "No encontramos ese rol. Actualizá la página.";
const SHIFT_NOT_FOUND = "No encontramos ese turno. Actualizá la página.";
const ROLE_UNAVAILABLE = "Ese rol ya no está disponible. Actualizá la página.";
const SHIFT_UNAVAILABLE =
  "Uno de los turnos ya no está disponible. Actualizá la página.";
const ROLE_NAME_TAKEN = "Ya hay un rol con ese nombre.";
const SHIFT_INACTIVE = "Ese turno está desactivado.";

/** A refusal decided inside a transaction; rolls it back. */
class Refusal extends Error {}

const UNAUTHORIZED: VolunteerAdminResult = {
  success: false,
  message: VOLUNTEER_ADMIN_COPY.unauthorized,
};

function refused(message: string): VolunteerAdminResult {
  return { success: false, message };
}

function invalid(error: {
  issues: { message: string }[];
}): VolunteerAdminResult {
  return refused(
    error.issues[0]?.message ?? "Revisá los datos e intentá de nuevo.",
  );
}

function failure(
  error: unknown,
  context: string,
  festivalId: number,
): VolunteerAdminResult {
  if (error instanceof Refusal) return refused(error.message);
  if (isImpersonationReadOnlyError(error))
    return IMPERSONATION_READ_ONLY_RESULT;
  console.error(context, { festivalId, ...loggableError(error) });
  return refused(VOLUNTEER_ADMIN_COPY.genericError);
}

function revalidateApplications(festivalId: number) {
  revalidatePath(volunteerAdminPath(festivalId), "layout");
}

/** Settings, roles and shifts also show on the public page. */
function revalidateCall(festivalId: number) {
  revalidatePath(volunteerAdminPath(festivalId), "layout");
  revalidatePath(VOLUNTEERS_PATH, "layout");
}

function reviewedBy(profileId: number) {
  const now = new Date();
  return { reviewedByUserId: profileId, reviewedAt: now, updatedAt: now };
}

/** "el sábado 19 de diciembre y el domingo 20 de diciembre" */
function spanishDays(days: string[]) {
  const names = days.map(
    (day) =>
      `el ${DateTime.fromISO(day, { zone: STORE_TIMEZONE })
        .setLocale("es")
        .toFormat("cccc d 'de' LLLL")}`,
  );
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

function laPazDay(date: Date) {
  return DateTime.fromJSDate(date, { zone: STORE_TIMEZONE }).toISODate()!;
}

/** "Lucía Mamani, Andrés Quispe y Ana Pérez" */
function spanishList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

async function festivalExists(festivalId: number) {
  const [festival] = await db
    .select({ id: festivals.id })
    .from(festivals)
    .where(eq(festivals.id, festivalId))
    .limit(1);
  return Boolean(festival);
}

/* ------------------------------------------------------------------ */
/* Applications                                                        */
/* ------------------------------------------------------------------ */

export async function updateVolunteerApplicationStatus(
  input: VolunteerStatusInput,
): Promise<VolunteerAdminResult> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return UNAUTHORIZED;
  const parsed = volunteerStatusInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, applicationId, status } = parsed.data;

  try {
    const [updated] = await db
      .update(volunteerApplications)
      .set({ status, ...reviewedBy(profile.id) })
      .where(
        and(
          eq(volunteerApplications.id, applicationId),
          eq(volunteerApplications.festivalId, festivalId),
        ),
      )
      .returning({ id: volunteerApplications.id });
    if (!updated) return refused(VOLUNTEER_ADMIN_COPY.notFound);
  } catch (error) {
    return failure(error, "Error updating a volunteer status", festivalId);
  }

  revalidateApplications(festivalId);
  return {
    success: true,
    message: `Estado actualizado: ${VOLUNTEER_STATUS_LABELS[status]}.`,
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Validates and stores an accepted application's role and shifts, replacing
 * the shifts it had. Any active shift of the festival may be given, not only
 * those the applicant marked. A role or shift deactivated since it was
 * assigned may stay assigned. More than VOLUNTEER_MAX_SHIFTS_PER_DAY on a La
 * Paz day is the public rule, but admins may make exceptions: it saves, and
 * the days are returned (yyyy-MM-dd) for a warning. Throws a Refusal; the
 * caller holds the application's row lock.
 */
async function replaceAssignment(
  tx: Tx,
  {
    festivalId,
    applicationId,
    currentRoleId,
    roleId,
    shiftIds,
  }: {
    festivalId: number;
    applicationId: number;
    currentRoleId: number | null;
    roleId: number | null;
    shiftIds: number[];
  },
): Promise<string[]> {
  let overLimit: string[] = [];
  if (roleId !== null) {
    const [role] = await tx
      .select({ isActive: volunteerRoles.isActive })
      .from(volunteerRoles)
      .where(
        and(
          eq(volunteerRoles.id, roleId),
          eq(volunteerRoles.festivalId, festivalId),
        ),
      );
    if (!role || (!role.isActive && roleId !== currentRoleId)) {
      throw new Refusal(ROLE_UNAVAILABLE);
    }
  }

  if (shiftIds.length > 0) {
    const [shifts, current] = await Promise.all([
      tx
        .select({
          id: volunteerShifts.id,
          startsAt: volunteerShifts.startsAt,
          isActive: volunteerShifts.isActive,
        })
        .from(volunteerShifts)
        .where(
          and(
            inArray(volunteerShifts.id, shiftIds),
            eq(volunteerShifts.festivalId, festivalId),
          ),
        ),
      tx
        .select({ shiftId: volunteerApplicationAssignedShifts.shiftId })
        .from(volunteerApplicationAssignedShifts)
        .where(
          eq(volunteerApplicationAssignedShifts.applicationId, applicationId),
        ),
    ]);
    const alreadyAssigned = new Set(current.map((row) => row.shiftId));
    if (
      shifts.length !== shiftIds.length ||
      shifts.some((shift) => !shift.isActive && !alreadyAssigned.has(shift.id))
    ) {
      throw new Refusal(SHIFT_UNAVAILABLE);
    }
    overLimit = daysOverShiftLimit(shifts);
  }

  await tx
    .delete(volunteerApplicationAssignedShifts)
    .where(
      and(
        eq(volunteerApplicationAssignedShifts.applicationId, applicationId),
        eq(volunteerApplicationAssignedShifts.festivalId, festivalId),
      ),
    );
  if (shiftIds.length > 0) {
    await tx
      .insert(volunteerApplicationAssignedShifts)
      .values(
        shiftIds.map((shiftId) => ({ applicationId, shiftId, festivalId })),
      );
  }
  return overLimit;
}

/**
 * The detail page's "Decisión y asignación" card, in one transaction: the
 * status and the notes, and, when the new status is "accepted", the role and
 * shifts (see replaceAssignment). Under any other status the stored
 * assignment is left as it is and the incoming role and shifts are ignored:
 * the form locks them, and an assignment outlives a status change. More
 * than VOLUNTEER_MAX_SHIFTS_PER_DAY on a day saves with a warning.
 */
export async function saveVolunteerReview(
  input: VolunteerReviewInput,
): Promise<VolunteerAdminResult> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return UNAUTHORIZED;
  const parsed = volunteerReviewInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const {
    festivalId,
    applicationId,
    status,
    roleId,
    shiftIds,
    adminNotes,
    loadedUpdatedAt,
  } = parsed.data;

  let overLimit: string[] = [];
  try {
    await db.transaction(async (tx) => {
      const application = await lockApplication(tx, festivalId, applicationId);
      // Changed since the form loaded (another tab, the shift screen): its
      // role, shifts and status would overwrite those changes.
      if (
        application.updatedAt.getTime() !== new Date(loadedUpdatedAt).getTime()
      ) {
        throw new Refusal(VOLUNTEER_ADMIN_COPY.staleReview);
      }

      const assigning = canAssignVolunteer(status);
      if (assigning) {
        overLimit = await replaceAssignment(tx, {
          festivalId,
          applicationId,
          currentRoleId: application.assignedRoleId,
          roleId,
          shiftIds,
        });
      }

      await tx
        .update(volunteerApplications)
        .set({
          status,
          adminNotes,
          ...(assigning ? { assignedRoleId: roleId } : {}),
          ...reviewedBy(profile.id),
        })
        .where(
          and(
            eq(volunteerApplications.id, applicationId),
            eq(volunteerApplications.festivalId, festivalId),
          ),
        );
    });
  } catch (error) {
    return failure(error, "Error saving a volunteer review", festivalId);
  }

  revalidateApplications(festivalId);
  return withOverLimitWarning("Cambios guardados.", overLimit);
}

/**
 * A success, with a warning when an application was left holding more than
 * VOLUNTEER_MAX_SHIFTS_PER_DAY on some La Paz days (yyyy-MM-dd).
 */
function withOverLimitWarning(
  message: string,
  overLimit: string[],
): VolunteerAdminResult {
  if (overLimit.length === 0) return { success: true, message };
  return {
    success: true,
    message,
    warning: `${message} Quedó con más de ${VOLUNTEER_MAX_SHIFTS_PER_DAY} turnos ${spanishDays(overLimit)}.`,
  };
}

/**
 * Locks an application of the festival for the rest of the transaction.
 * Throws a Refusal when the festival has no such application.
 */
async function lockApplication(
  tx: Tx,
  festivalId: number,
  applicationId: number,
) {
  const [application] = await tx
    .select({
      fullName: volunteerApplications.fullName,
      status: volunteerApplications.status,
      assignedRoleId: volunteerApplications.assignedRoleId,
      firstChoiceRoleId: volunteerApplications.firstChoiceRoleId,
      secondChoiceRoleId: volunteerApplications.secondChoiceRoleId,
      updatedAt: volunteerApplications.updatedAt,
    })
    .from(volunteerApplications)
    .where(
      and(
        eq(volunteerApplications.id, applicationId),
        eq(volunteerApplications.festivalId, festivalId),
      ),
    )
    .for("update");
  if (!application) throw new Refusal(VOLUNTEER_ADMIN_COPY.notFound);
  return application;
}

/** Whether the application holds the shift. */
async function holdsShift(tx: Tx, applicationId: number, shiftId: number) {
  const [row] = await tx
    .select({ shiftId: volunteerApplicationAssignedShifts.shiftId })
    .from(volunteerApplicationAssignedShifts)
    .where(
      and(
        eq(volunteerApplicationAssignedShifts.applicationId, applicationId),
        eq(volunteerApplicationAssignedShifts.shiftId, shiftId),
      ),
    );
  return Boolean(row);
}

/**
 * The shift screen's "Asignar": adds one active shift of the festival to an
 * application, keeping its other shifts. A pending or waitlisted application
 * also becomes accepted while VOLUNTEER_ASSIGN_AUTO_ACCEPTS is on (see
 * decideShiftAssignment); a rejected one is refused. Someone with no role
 * gets their 1st choice, or their 2nd when the 1st is inactive. More than
 * VOLUNTEER_MAX_SHIFTS_PER_DAY that day saves with a warning. Already
 * assigned: a success that changes nothing.
 */
export async function assignVolunteerShift(
  input: VolunteerShiftAssignmentInput,
): Promise<VolunteerAdminResult> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return UNAUTHORIZED;
  const parsed = volunteerShiftAssignmentInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, shiftId, applicationId } = parsed.data;

  let outcome: {
    fullName: string;
    changed: boolean;
    accepted: boolean;
    overLimit: string[];
  };
  try {
    outcome = await db.transaction(async (tx) => {
      const application = await lockApplication(tx, festivalId, applicationId);
      const decision = decideShiftAssignment(application.status);
      if (decision.kind === "refuse") throw new Refusal(decision.message);

      const [shift] = await tx
        .select({
          startsAt: volunteerShifts.startsAt,
          isActive: volunteerShifts.isActive,
        })
        .from(volunteerShifts)
        .where(
          and(
            eq(volunteerShifts.id, shiftId),
            eq(volunteerShifts.festivalId, festivalId),
          ),
        );
      if (!shift) throw new Refusal(SHIFT_NOT_FOUND);
      const { fullName } = application;
      if (await holdsShift(tx, applicationId, shiftId)) {
        return { fullName, changed: false, accepted: false, overLimit: [] };
      }
      if (!shift.isActive) throw new Refusal(SHIFT_INACTIVE);

      let assignedRoleId = application.assignedRoleId;
      if (assignedRoleId === null) {
        const activeRoles = await tx
          .select({ id: volunteerRoles.id })
          .from(volunteerRoles)
          .where(
            and(
              eq(volunteerRoles.festivalId, festivalId),
              eq(volunteerRoles.isActive, true),
              inArray(volunteerRoles.id, [
                application.firstChoiceRoleId,
                application.secondChoiceRoleId,
              ]),
            ),
          );
        assignedRoleId = defaultAssignedRoleId(
          application,
          new Set(activeRoles.map((role) => role.id)),
        );
      }

      await tx
        .insert(volunteerApplicationAssignedShifts)
        .values({ applicationId, shiftId, festivalId });
      await tx
        .update(volunteerApplications)
        .set({
          ...(decision.accept ? { status: "accepted" as const } : {}),
          assignedRoleId,
          ...reviewedBy(profile.id),
        })
        .where(
          and(
            eq(volunteerApplications.id, applicationId),
            eq(volunteerApplications.festivalId, festivalId),
          ),
        );

      const held = await tx
        .select({ startsAt: volunteerShifts.startsAt })
        .from(volunteerApplicationAssignedShifts)
        .innerJoin(
          volunteerShifts,
          eq(volunteerShifts.id, volunteerApplicationAssignedShifts.shiftId),
        )
        .where(
          eq(volunteerApplicationAssignedShifts.applicationId, applicationId),
        );
      const day = laPazDay(shift.startsAt);
      return {
        fullName,
        changed: true,
        accepted: decision.accept,
        overLimit: daysOverShiftLimit(held).filter((over) => over === day),
      };
    });
  } catch (error) {
    return failure(error, "Error assigning a volunteer shift", festivalId);
  }

  if (!outcome.changed) {
    return {
      success: true,
      message: `Ese turno ya estaba asignado a ${outcome.fullName}.`,
    };
  }
  revalidateApplications(festivalId);
  const message = outcome.accepted
    ? `Turno asignado a ${outcome.fullName}. Su postulación pasó a Aceptada.`
    : `Turno asignado a ${outcome.fullName}.`;
  return withOverLimitWarning(message, outcome.overLimit);
}

/**
 * The shift screen's "Quitar": removes only this shift from the application;
 * its status, role and other shifts stay. Not assigned: a success that
 * changes nothing.
 */
export async function unassignVolunteerShift(
  input: VolunteerShiftAssignmentInput,
): Promise<VolunteerAdminResult> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return UNAUTHORIZED;
  const parsed = volunteerShiftAssignmentInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, shiftId, applicationId } = parsed.data;

  let outcome: { fullName: string; changed: boolean };
  try {
    outcome = await db.transaction(async (tx) => {
      const { fullName } = await lockApplication(tx, festivalId, applicationId);
      const removed = await tx
        .delete(volunteerApplicationAssignedShifts)
        .where(
          and(
            eq(volunteerApplicationAssignedShifts.applicationId, applicationId),
            eq(volunteerApplicationAssignedShifts.shiftId, shiftId),
            eq(volunteerApplicationAssignedShifts.festivalId, festivalId),
          ),
        )
        .returning({ shiftId: volunteerApplicationAssignedShifts.shiftId });
      if (removed.length === 0) return { fullName, changed: false };

      await tx
        .update(volunteerApplications)
        .set(reviewedBy(profile.id))
        .where(
          and(
            eq(volunteerApplications.id, applicationId),
            eq(volunteerApplications.festivalId, festivalId),
          ),
        );
      return { fullName, changed: true };
    });
  } catch (error) {
    return failure(error, "Error unassigning a volunteer shift", festivalId);
  }

  if (!outcome.changed) {
    return {
      success: true,
      message: `${outcome.fullName} ya no estaba en este turno.`,
    };
  }
  revalidateApplications(festivalId);
  return {
    success: true,
    message: `Quitamos a ${outcome.fullName} de este turno.`,
  };
}

/* ------------------------------------------------------------------ */
/* The call: settings, roles and shifts                                */
/* ------------------------------------------------------------------ */

/** Creates the festival's call the first time, then updates it. */
export async function updateVolunteerCallSettings(
  input: VolunteerCallSettingsInput,
): Promise<VolunteerAdminResult> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return UNAUTHORIZED;
  const parsed = volunteerCallSettingsInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, applicationsCloseAt, inductionDate, inductionTime } =
    parsed.data;

  try {
    if (!(await festivalExists(festivalId))) {
      return refused(FESTIVAL_NOT_FOUND);
    }
    const values = { applicationsCloseAt, inductionDate, inductionTime };
    await db
      .insert(volunteerCallSettings)
      .values({ festivalId, ...values })
      .onConflictDoUpdate({
        target: volunteerCallSettings.festivalId,
        set: { ...values, updatedAt: new Date() },
      });
  } catch (error) {
    return failure(error, "Error saving volunteer call settings", festivalId);
  }

  revalidateCall(festivalId);
  return { success: true, message: "Convocatoria guardada." };
}

/**
 * Creates a role (active) without `roleId`, last unless `sortOrder` is given,
 * or updates that one, keeping its place unless `sortOrder` is given.
 */
export async function saveVolunteerRole(
  input: VolunteerRoleInput,
): Promise<VolunteerAdminResult> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return UNAUTHORIZED;
  const parsed = volunteerRoleInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, roleId, name, description, sortOrder } = parsed.data;

  try {
    if (roleId === undefined) {
      if (!(await festivalExists(festivalId))) {
        return refused(FESTIVAL_NOT_FOUND);
      }
      await db.insert(volunteerRoles).values({
        festivalId,
        name,
        description,
        sortOrder:
          sortOrder ??
          sql<number>`(
            select coalesce(max(${volunteerRoles.sortOrder}), 0) + 1
            from ${volunteerRoles}
            where ${volunteerRoles.festivalId} = ${festivalId}
          )`,
        isActive: true,
      });
    } else {
      const [updated] = await db
        .update(volunteerRoles)
        .set({
          name,
          description,
          ...(sortOrder === undefined ? {} : { sortOrder }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(volunteerRoles.id, roleId),
            eq(volunteerRoles.festivalId, festivalId),
          ),
        )
        .returning({ id: volunteerRoles.id });
      if (!updated) return refused(ROLE_NOT_FOUND);
    }
  } catch (error) {
    if (
      isUniqueViolationOn(
        error,
        (constraint) => constraint === "volunteer_roles_festival_name_unique",
      )
    ) {
      return refused(ROLE_NAME_TAKEN);
    }
    return failure(error, "Error saving a volunteer role", festivalId);
  }

  revalidateCall(festivalId);
  return {
    success: true,
    message: roleId === undefined ? "Rol creado." : "Rol actualizado.",
  };
}

/**
 * The roles table's up/down buttons: swaps the role with its neighbour in
 * the festival's order (sortOrder, then id) and renumbers every role 1..n,
 * so ties and gaps from older data are gone after the first move. At either
 * end it changes nothing.
 */
export async function moveVolunteerRole(
  input: VolunteerRoleMoveInput,
): Promise<VolunteerAdminResult> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return UNAUTHORIZED;
  const parsed = volunteerRoleMoveInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, roleId, direction } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const roles = await tx
        .select({ id: volunteerRoles.id, sortOrder: volunteerRoles.sortOrder })
        .from(volunteerRoles)
        .where(eq(volunteerRoles.festivalId, festivalId))
        .orderBy(asc(volunteerRoles.sortOrder), asc(volunteerRoles.id))
        .for("update");
      const index = roles.findIndex((role) => role.id === roleId);
      if (index === -1) throw new Refusal(ROLE_NOT_FOUND);
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= roles.length) return;

      const order = [...roles];
      [order[index], order[target]] = [order[target]!, order[index]!];
      const now = new Date();
      for (const [position, role] of order.entries()) {
        if (role.sortOrder === position + 1) continue;
        await tx
          .update(volunteerRoles)
          .set({ sortOrder: position + 1, updatedAt: now })
          .where(
            and(
              eq(volunteerRoles.id, role.id),
              eq(volunteerRoles.festivalId, festivalId),
            ),
          );
      }
    });
  } catch (error) {
    return failure(error, "Error moving a volunteer role", festivalId);
  }

  revalidateCall(festivalId);
  return { success: true, message: "Orden actualizado." };
}

/** Roles are never deleted: applications keep naming them. */
export async function setVolunteerRoleActive(
  input: VolunteerActiveInput,
): Promise<VolunteerAdminResult> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return UNAUTHORIZED;
  const parsed = volunteerActiveInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, id, isActive } = parsed.data;

  try {
    const [updated] = await db
      .update(volunteerRoles)
      .set({ isActive, updatedAt: new Date() })
      .where(
        and(
          eq(volunteerRoles.id, id),
          eq(volunteerRoles.festivalId, festivalId),
        ),
      )
      .returning({ id: volunteerRoles.id });
    if (!updated) return refused(ROLE_NOT_FOUND);
  } catch (error) {
    return failure(error, "Error toggling a volunteer role", festivalId);
  }

  revalidateCall(festivalId);
  return {
    success: true,
    message: isActive ? "Rol activado." : "Rol desactivado.",
  };
}

/**
 * The people assigned to `shiftId` (any status: assignments stay when an
 * application leaves "accepted") who would hold more than
 * VOLUNTEER_MAX_SHIFTS_PER_DAY on the La Paz day of `startsAt` if the shift
 * started then, by name; empty when the move respects the limit for everyone.
 */
async function shiftMoveConflicts(
  tx: Tx,
  {
    festivalId,
    shiftId,
    startsAt,
  }: { festivalId: number; shiftId: number; startsAt: Date },
): Promise<string[]> {
  const assigned = await tx
    .select({ applicationId: volunteerApplicationAssignedShifts.applicationId })
    .from(volunteerApplicationAssignedShifts)
    .where(
      and(
        eq(volunteerApplicationAssignedShifts.shiftId, shiftId),
        eq(volunteerApplicationAssignedShifts.festivalId, festivalId),
      ),
    );
  if (assigned.length === 0) return [];

  const rows = await tx
    .select({
      applicationId: volunteerApplications.id,
      fullName: volunteerApplications.fullName,
      shiftId: volunteerShifts.id,
      startsAt: volunteerShifts.startsAt,
    })
    .from(volunteerApplicationAssignedShifts)
    .innerJoin(
      volunteerApplications,
      eq(
        volunteerApplications.id,
        volunteerApplicationAssignedShifts.applicationId,
      ),
    )
    .innerJoin(
      volunteerShifts,
      eq(volunteerShifts.id, volunteerApplicationAssignedShifts.shiftId),
    )
    .where(
      and(
        inArray(
          volunteerApplicationAssignedShifts.applicationId,
          assigned.map((row) => row.applicationId),
        ),
        eq(volunteerApplicationAssignedShifts.festivalId, festivalId),
      ),
    )
    .orderBy(
      asc(volunteerApplications.fullName),
      asc(volunteerApplications.id),
    );

  const byApplication = new Map<
    number,
    { fullName: string; shifts: { startsAt: Date }[] }
  >();
  for (const row of rows) {
    const entry = byApplication.get(row.applicationId) ?? {
      fullName: row.fullName,
      shifts: [],
    };
    entry.shifts.push({
      startsAt: row.shiftId === shiftId ? startsAt : row.startsAt,
    });
    byApplication.set(row.applicationId, entry);
  }
  const day = laPazDay(startsAt);
  return [...byApplication.values()]
    .filter(({ shifts }) => daysOverShiftLimit(shifts).includes(day))
    .map(({ fullName }) => fullName);
}

/**
 * Numbers the festival's shifts 1..n by start (then id), so the public page,
 * which lists them by sortOrder, shows them chronologically.
 */
async function renumberShifts(tx: Tx, festivalId: number) {
  await tx.execute(sql`
    update ${volunteerShifts}
    set sort_order = ordered.position
    from (
      select id, row_number() over (order by starts_at, id)::int as position
      from ${volunteerShifts}
      where festival_id = ${festivalId}
    ) as ordered
    where ${volunteerShifts.id} = ordered.id
      and ${volunteerShifts.sortOrder} <> ordered.position
  `);
}

/**
 * Creates a shift (active) without `shiftId`, or updates that one, then
 * renumbers the festival's shifts chronologically. A move to another La Paz
 * day that leaves someone assigned with more than
 * VOLUNTEER_MAX_SHIFTS_PER_DAY on it saves, with a warning naming them (only
 * in the answer, never in the logs).
 */
export async function saveVolunteerShift(
  input: VolunteerShiftInput,
): Promise<VolunteerAdminResult> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return UNAUTHORIZED;
  const parsed = volunteerShiftInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, shiftId, label, startsAt, endsAt, neededHeadcount } =
    parsed.data;
  const values = { label, startsAt, endsAt, neededHeadcount };

  let overLimit: string[] = [];
  try {
    if (shiftId === undefined) {
      if (!(await festivalExists(festivalId))) {
        return refused(FESTIVAL_NOT_FOUND);
      }
      await db.transaction(async (tx) => {
        await tx
          .insert(volunteerShifts)
          .values({ festivalId, ...values, isActive: true });
        await renumberShifts(tx, festivalId);
      });
    } else {
      await db.transaction(async (tx) => {
        const [shift] = await tx
          .select({ startsAt: volunteerShifts.startsAt })
          .from(volunteerShifts)
          .where(
            and(
              eq(volunteerShifts.id, shiftId),
              eq(volunteerShifts.festivalId, festivalId),
            ),
          )
          .for("update");
        if (!shift) throw new Refusal(SHIFT_NOT_FOUND);

        // Within its day a shift changes nobody's count for that day.
        if (laPazDay(shift.startsAt) !== laPazDay(startsAt)) {
          overLimit = await shiftMoveConflicts(tx, {
            festivalId,
            shiftId,
            startsAt,
          });
        }

        await tx
          .update(volunteerShifts)
          .set({ ...values, updatedAt: new Date() })
          .where(
            and(
              eq(volunteerShifts.id, shiftId),
              eq(volunteerShifts.festivalId, festivalId),
            ),
          );
        await renumberShifts(tx, festivalId);
      });
    }
  } catch (error) {
    return failure(error, "Error saving a volunteer shift", festivalId);
  }

  revalidateCall(festivalId);
  const message =
    shiftId === undefined ? "Turno creado." : "Turno actualizado.";
  if (overLimit.length === 0) return { success: true, message };
  return {
    success: true,
    message,
    warning: `${message} ${spanishList(overLimit)} ${
      overLimit.length === 1 ? "quedó" : "quedaron"
    } con más de ${VOLUNTEER_MAX_SHIFTS_PER_DAY} turnos ${spanishDays([laPazDay(startsAt)])}.`,
  };
}

/** Shifts are never deleted: applications keep naming them. */
export async function setVolunteerShiftActive(
  input: VolunteerActiveInput,
): Promise<VolunteerAdminResult> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return UNAUTHORIZED;
  const parsed = volunteerActiveInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, id, isActive } = parsed.data;

  try {
    const [updated] = await db
      .update(volunteerShifts)
      .set({ isActive, updatedAt: new Date() })
      .where(
        and(
          eq(volunteerShifts.id, id),
          eq(volunteerShifts.festivalId, festivalId),
        ),
      )
      .returning({ id: volunteerShifts.id });
    if (!updated) return refused(SHIFT_NOT_FOUND);
  } catch (error) {
    return failure(error, "Error toggling a volunteer shift", festivalId);
  }

  revalidateCall(festivalId);
  return {
    success: true,
    message: isActive ? "Turno activado." : "Turno desactivado.",
  };
}
