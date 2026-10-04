import { DateTime } from "luxon";
import { z } from "zod";

import { phoneValidator } from "@/app/components/form/input-validators";
import { formatDate } from "@/app/lib/formatters";
import { stringToUTCDate } from "@/app/utils/dateUtils";
import { genderEnum } from "@/db/schema";

/**
 * What a new visitor tells us about themselves, checked the same way in the
 * forms and in the server actions that store it.
 */

export const VISITOR_MIN_AGE = 10;

/** Letters (any script), spaces, hyphens and apostrophes: personal names. */
const NAME_CHARS = /^[\p{L}\s'-]+$/u;

function personName(label: "nombre" | "apellido") {
  return z
    .string()
    .trim()
    .min(2, { error: `El ${label} tiene que tener al menos dos letras` })
    .max(60, { error: `El ${label} es demasiado largo` })
    .regex(NAME_CHARS, {
      error: `Usa solo letras, espacios y guiones en tu ${label}`,
    });
}

/** `yyyy-MM-dd`, the calendar day the visitor picked. */
const birthdate = z
  .string()
  .min(1, { error: "Ingresa tu fecha de nacimiento" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "La fecha no es válida" })
  .refine((value) => DateTime.fromISO(value).isValid, {
    error: "La fecha no es válida",
  })
  .refine((value) => DateTime.fromISO(value).year >= 1900, {
    error: "La fecha no es válida",
  })
  // ISO dates order the same as strings. "Today" is the store's day.
  .refine(
    (value) =>
      value <=
      (formatDate(new Date()).minus({ years: VISITOR_MIN_AGE }).toISODate() ??
        ""),
    {
      error: `Debes tener al menos ${VISITOR_MIN_AGE} años para registrarte`,
    },
  );

export const visitorDetailsSchema = z.object({
  firstName: personName("nombre"),
  lastName: personName("apellido"),
  birthdate,
  phoneNumber: phoneValidator(),
  gender: z.enum([...genderEnum.enumValues]),
});

export type VisitorDetails = z.input<typeof visitorDetailsSchema>;

/** Stored at noon UTC, so the calendar day reads the same in every zone. */
export function birthdateForStorage(value: string) {
  return stringToUTCDate(value);
}
