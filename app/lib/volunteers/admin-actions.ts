"use server";

import { and, eq, inArray } from "drizzle-orm";
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
  VOLUNTEER_ADMIN_COPY,
  VOLUNTEER_STATUS_LABELS,
  type VolunteerAdminResult,
  volunteerAdminPath,
} from "@/app/lib/volunteers/admin-definitions";
import {
  type VolunteerActiveInput,
  volunteerActiveInputSchema,
  type VolunteerAssignmentInput,
  volunteerAssignmentInputSchema,
  type VolunteerCallSettingsInput,
  volunteerCallSettingsInputSchema,
  type VolunteerNotesInput,
  volunteerNotesInputSchema,
  type VolunteerRoleInput,
  volunteerRoleInputSchema,
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

export async function updateVolunteerApplicationNotes(
  input: VolunteerNotesInput,
): Promise<VolunteerAdminResult> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return UNAUTHORIZED;
  const parsed = volunteerNotesInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, applicationId, adminNotes } = parsed.data;

  try {
    const [updated] = await db
      .update(volunteerApplications)
      .set({ adminNotes, ...reviewedBy(profile.id) })
      .where(
        and(
          eq(volunteerApplications.id, applicationId),
          eq(volunteerApplications.festivalId, festivalId),
        ),
      )
      .returning({ id: volunteerApplications.id });
    if (!updated) return refused(VOLUNTEER_ADMIN_COPY.notFound);
  } catch (error) {
    return failure(error, "Error updating volunteer notes", festivalId);
  }

  revalidateApplications(festivalId);
  return { success: true, message: "Notas guardadas." };
}

/**
 * Sets the application's role and replaces its shifts. Only for an accepted
 * application. Any active shift of the festival may be given, not only those
 * the applicant marked, up to VOLUNTEER_MAX_SHIFTS_PER_DAY per La Paz day.
 * A role or shift deactivated since it was assigned may stay assigned.
 */
export async function updateVolunteerAssignment(
  input: VolunteerAssignmentInput,
): Promise<VolunteerAdminResult> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return UNAUTHORIZED;
  const parsed = volunteerAssignmentInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { festivalId, applicationId, roleId, shiftIds } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const [application] = await tx
        .select({
          status: volunteerApplications.status,
          assignedRoleId: volunteerApplications.assignedRoleId,
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
      if (!canAssignVolunteer(application.status)) {
        throw new Refusal(VOLUNTEER_ADMIN_COPY.assignmentLocked);
      }

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
        if (
          !role ||
          (!role.isActive && roleId !== application.assignedRoleId)
        ) {
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
              eq(
                volunteerApplicationAssignedShifts.applicationId,
                applicationId,
              ),
            ),
        ]);
        const alreadyAssigned = new Set(current.map((row) => row.shiftId));
        if (
          shifts.length !== shiftIds.length ||
          shifts.some(
            (shift) => !shift.isActive && !alreadyAssigned.has(shift.id),
          )
        ) {
          throw new Refusal(SHIFT_UNAVAILABLE);
        }
        const overLimit = daysOverShiftLimit(shifts);
        if (overLimit.length > 0) {
          throw new Refusal(
            `Máximo ${VOLUNTEER_MAX_SHIFTS_PER_DAY} turnos por día: revisá ${spanishDays(overLimit)}.`,
          );
        }
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
      await tx
        .update(volunteerApplications)
        .set({ assignedRoleId: roleId, ...reviewedBy(profile.id) })
        .where(
          and(
            eq(volunteerApplications.id, applicationId),
            eq(volunteerApplications.festivalId, festivalId),
          ),
        );
    });
  } catch (error) {
    return failure(error, "Error updating a volunteer assignment", festivalId);
  }

  revalidateApplications(festivalId);
  return { success: true, message: "Asignación guardada." };
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

/** Creates a role (active) without `roleId`, or updates that one. */
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
      await db
        .insert(volunteerRoles)
        .values({ festivalId, name, description, sortOrder, isActive: true });
    } else {
      const [updated] = await db
        .update(volunteerRoles)
        .set({ name, description, sortOrder, updatedAt: new Date() })
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

/** Creates a shift (active) without `shiftId`, or updates that one. */
export async function saveVolunteerShift(
  input: VolunteerShiftInput,
): Promise<VolunteerAdminResult> {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return UNAUTHORIZED;
  const parsed = volunteerShiftInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const {
    festivalId,
    shiftId,
    label,
    startsAt,
    endsAt,
    neededHeadcount,
    sortOrder,
  } = parsed.data;
  const values = { label, startsAt, endsAt, neededHeadcount, sortOrder };

  try {
    if (shiftId === undefined) {
      if (!(await festivalExists(festivalId))) {
        return refused(FESTIVAL_NOT_FOUND);
      }
      await db
        .insert(volunteerShifts)
        .values({ festivalId, ...values, isActive: true });
    } else {
      const [updated] = await db
        .update(volunteerShifts)
        .set({ ...values, updatedAt: new Date() })
        .where(
          and(
            eq(volunteerShifts.id, shiftId),
            eq(volunteerShifts.festivalId, festivalId),
          ),
        )
        .returning({ id: volunteerShifts.id });
      if (!updated) return refused(SHIFT_NOT_FOUND);
    }
  } catch (error) {
    return failure(error, "Error saving a volunteer shift", festivalId);
  }

  revalidateCall(festivalId);
  return {
    success: true,
    message: shiftId === undefined ? "Turno creado." : "Turno actualizado.",
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
