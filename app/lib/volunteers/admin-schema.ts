import { DateTime } from "luxon";
import { z } from "zod";

import { parseStoreDateTimeLocal } from "@/app/lib/schedule-time";
import { VOLUNTEER_APPLICATION_STATUSES } from "@/app/lib/volunteers/admin-definitions";

/**
 * Inputs of the volunteer admin actions. Client-safe: the forms validate with
 * these schemas and the actions parse the same input again on the server.
 * Date-times travel as "yyyy-MM-ddTHH:mm" on La Paz's clock (datetime-local),
 * and become instants only here, through parseStoreDateTimeLocal.
 */

const id = z.coerce.number().int().positive();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
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

export const volunteerCallSettingsInputSchema = z
  .object({
    festivalId: id,
    applicationsCloseAt: storeDateTime("Indicá la fecha y la hora de cierre."),
    inductionDate: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" ||
          (ISO_DATE.test(value) && DateTime.fromISO(value).isValid),
        { error: "La fecha no es válida." },
      )
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
  sortOrder,
});
export type VolunteerRoleInput = z.input<typeof volunteerRoleInputSchema>;

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
    startsAt: storeDateTime("Indicá cuándo empieza."),
    endsAt: storeDateTime("Indicá cuándo termina."),
    neededHeadcount: z.coerce
      .number({ error: "Indicá cuántas personas hacen falta." })
      .int("Indicá un número entero.")
      .min(0, "No puede ser negativo.")
      .max(999, "Es demasiado grande."),
    sortOrder,
  })
  .superRefine((values, issues) => {
    if (values.endsAt <= values.startsAt) {
      issues.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "El fin tiene que ser posterior al inicio.",
      });
    }
  });
export type VolunteerShiftInput = z.input<typeof volunteerShiftInputSchema>;

export const volunteerActiveInputSchema = z.object({
  festivalId: id,
  id,
  isActive: z.boolean(),
});
export type VolunteerActiveInput = z.input<typeof volunteerActiveInputSchema>;
