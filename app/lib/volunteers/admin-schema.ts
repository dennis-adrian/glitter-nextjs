import { DateTime } from "luxon";
import { z } from "zod";

import { parseStoreDateTimeLocal } from "@/app/lib/schedule-time";
import {
  POSTGRES_INT_MAX,
  VOLUNTEER_APPLICATION_STATUSES,
} from "@/app/lib/volunteers/admin-definitions";

/**
 * Inputs of the volunteer admin actions. Client-safe: the forms validate with
 * these schemas and the actions parse the same input again on the server.
 * Date-times travel as "yyyy-MM-ddTHH:mm" on La Paz's clock (datetime-local),
 * and become instants only here, through parseStoreDateTimeLocal.
 */

const id = z.coerce.number().int().positive().max(POSTGRES_INT_MAX);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (value: string) =>
  ISO_DATE.test(value) && DateTime.fromISO(value).isValid;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A datetime-local value read as La Paz time. */
const storeDateTime = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .refine((value) => parseStoreDateTimeLocal(value) !== null, {
      error: message,
    })
    .transform((value) => parseStoreDateTimeLocal(value)!);

export const volunteerStatusInputSchema = z.object({
  festivalId: id,
  applicationId: id,
  status: z.enum(VOLUNTEER_APPLICATION_STATUSES, {
    error: "Elegí un estado.",
  }),
});
export type VolunteerStatusInput = z.input<typeof volunteerStatusInputSchema>;

export const VOLUNTEER_ADMIN_NOTES_MAX_LENGTH = 2000;

export const volunteerNotesInputSchema = z.object({
  festivalId: id,
  applicationId: id,
  adminNotes: z
    .string()
    .trim()
    .max(VOLUNTEER_ADMIN_NOTES_MAX_LENGTH, "Es demasiado largo")
    .transform((value) => (value ? value : null)),
});
export type VolunteerNotesInput = z.input<typeof volunteerNotesInputSchema>;

export const volunteerAssignmentInputSchema = z.object({
  festivalId: id,
  applicationId: id,
  /** Null clears the assigned role. */
  roleId: id.nullable(),
  shiftIds: z
    .array(id)
    .max(50)
    .transform((ids) => [...new Set(ids)]),
});
export type VolunteerAssignmentInput = z.input<
  typeof volunteerAssignmentInputSchema
>;

/** The shift screen's "Asignar" and "Quitar": one application, one shift. */
export const volunteerShiftAssignmentInputSchema = z.object({
  festivalId: id,
  shiftId: id,
  applicationId: id,
});
export type VolunteerShiftAssignmentInput = z.input<
  typeof volunteerShiftAssignmentInputSchema
>;

/**
 * The detail page's "Decisión y asignación" card, saved at once: status,
 * notes and, when the status is "accepted", the assigned role and shifts.
 */
export const volunteerReviewInputSchema = z.object({
  festivalId: id,
  applicationId: id,
  status: z.enum(VOLUNTEER_APPLICATION_STATUSES, {
    error: "Elegí un estado.",
  }),
  roleId: id.nullable(),
  shiftIds: z
    .array(id)
    .max(50)
    .transform((ids) => [...new Set(ids)]),
  adminNotes: z
    .string()
    .trim()
    .max(VOLUNTEER_ADMIN_NOTES_MAX_LENGTH, "Es demasiado largo")
    .transform((value) => (value ? value : null)),
  /**
   * The application's updatedAt as the form loaded it (ISO). A save is
   * refused when the row changed since, so a stale tab cannot overwrite
   * someone else's assignment, role or status.
   */
  loadedUpdatedAt: z.iso.datetime(),
});
export type VolunteerReviewInput = z.input<typeof volunteerReviewInputSchema>;

export const volunteerCallSettingsInputSchema = z
  .object({
    festivalId: id,
    applicationsCloseAt: storeDateTime("Indicá la fecha y la hora de cierre."),
    inductionDate: z
      .string()
      .trim()
      .refine((value) => value === "" || isIsoDate(value), {
        error: "La fecha no es válida.",
      })
      .transform((value) => (value ? value : null)),
    inductionTime: z
      .string()
      .trim()
      .refine((value) => value === "" || TIME.test(value.slice(0, 5)), {
        error: "La hora no es válida.",
      })
      .transform((value) => (value ? value.slice(0, 5) : null)),
  })
  .superRefine((values, issues) => {
    if (values.inductionTime && !values.inductionDate) {
      issues.addIssue({
        code: "custom",
        path: ["inductionDate"],
        message: "Indicá la fecha de la inducción.",
      });
    }
  });
export type VolunteerCallSettingsInput = z.input<
  typeof volunteerCallSettingsInputSchema
>;

const sortOrder = z.coerce
  .number({ error: "Indicá un número." })
  .int("Indicá un número entero.")
  .min(0, "No puede ser negativo.")
  .max(999, "Es demasiado grande.");

export const volunteerRoleInputSchema = z.object({
  festivalId: id,
  /** Absent to create a role. */
  roleId: id.optional(),
  name: z
    .string({ error: "Escribí el nombre del rol." })
    .trim()
    .min(1, "Escribí el nombre del rol.")
    .max(120, "Es demasiado largo"),
  description: z
    .string({ error: "Escribí una descripción corta." })
    .trim()
    .min(1, "Escribí una descripción corta.")
    .max(300, "Es demasiado largo"),
  /** Omitted: a new role goes last; an edited one keeps its place. */
  sortOrder: sortOrder.optional(),
});
export type VolunteerRoleInput = z.input<typeof volunteerRoleInputSchema>;

/** The roles table's up/down buttons. */
export const volunteerRoleMoveInputSchema = z.object({
  festivalId: id,
  roleId: id,
  direction: z.enum(["up", "down"]),
});
export type VolunteerRoleMoveInput = z.input<
  typeof volunteerRoleMoveInputSchema
>;

/**
 * A shift as the "Turnos" table edits it: one La Paz day, a start and an end
 * time on it, a name and a cupo. Shifts are listed by time, so there is no
 * order to set.
 */
export const volunteerShiftInputSchema = z
  .object({
    festivalId: id,
    /** Absent to create a shift. */
    shiftId: id.optional(),
    label: z
      .string({ error: "Escribí el nombre del turno." })
      .trim()
      .min(1, "Escribí el nombre del turno.")
      .max(120, "Es demasiado largo"),
    /** yyyy-MM-dd, La Paz */
    date: z
      .string({ error: "Indicá el día." })
      .trim()
      .refine(isIsoDate, { error: "Indicá el día." }),
    /** HH:mm */
    startTime: z
      .string({ error: "Indicá la hora de inicio." })
      .trim()
      .refine((value) => TIME.test(value.slice(0, 5)), {
        error: "Indicá la hora de inicio.",
      })
      .transform((value) => value.slice(0, 5)),
    /** HH:mm, the same day */
    endTime: z
      .string({ error: "Indicá la hora de fin." })
      .trim()
      .refine((value) => TIME.test(value.slice(0, 5)), {
        error: "Indicá la hora de fin.",
      })
      .transform((value) => value.slice(0, 5)),
    // An empty input is a missing cupo, not 0 (Number("") is 0).
    neededHeadcount: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      z.coerce
        .number({ error: "Indicá el cupo." })
        .int("Indicá un número entero.")
        .min(0, "No puede ser negativo.")
        .max(999, "Es demasiado grande."),
    ),
  })
  .superRefine((values, issues) => {
    if (values.endTime <= values.startTime) {
      issues.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "El fin tiene que ser posterior al inicio.",
      });
    }
  })
  .transform(({ date, startTime, endTime, ...rest }) => ({
    ...rest,
    startsAt: parseStoreDateTimeLocal(`${date}T${startTime}`)!,
    endsAt: parseStoreDateTimeLocal(`${date}T${endTime}`)!,
  }));
export type VolunteerShiftInput = z.input<typeof volunteerShiftInputSchema>;

export const volunteerActiveInputSchema = z.object({
  festivalId: id,
  id,
  isActive: z.boolean(),
});
export type VolunteerActiveInput = z.input<typeof volunteerActiveInputSchema>;
