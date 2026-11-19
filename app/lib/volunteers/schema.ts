import { DateTime } from "luxon";
import { z } from "zod";

import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { isPhoneValid } from "@/app/lib/phone-validator";
import {
  VOLUNTEER_COPY,
  VOLUNTEER_EXPERIENCE_VALUES,
  VOLUNTEER_MIN_AGE,
  VOLUNTEER_MOTIVATION_MAX_LENGTH,
  VOLUNTEER_REFERRAL_VALUES,
} from "@/app/lib/volunteers/definitions";

/**
 * The one schema the form (client) and the server action both validate with.
 * Client-safe and pure: everything that depends on the database or the clock
 * comes in through `VolunteerSchemaContext`, which the page builds from the
 * same rows the server action reads.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The La Paz date of the earliest active shift: the day an applicant must
 * already be 18 on. For v11 that is the setup day, 18 Dec 2026.
 */
export function volunteerAgeCutoffDate(
  shifts: ReadonlyArray<{ startsAt: Date; isActive?: boolean }>,
): string | null {
  const active = shifts.filter((shift) => shift.isActive !== false);
  if (active.length === 0) return null;
  const earliest = active.reduce((min, shift) =>
    shift.startsAt < min.startsAt ? shift : min,
  );
  return DateTime.fromJSDate(earliest.startsAt, {
    zone: STORE_TIMEZONE,
  }).toISODate();
}

/** Whether someone born on `birthdate` is `minAge` or older on `onDate`. */
export function isOldEnoughOn(
  birthdate: string,
  onDate: string,
  minAge = VOLUNTEER_MIN_AGE,
): boolean {
  const born = DateTime.fromISO(birthdate, { zone: "utc" });
  const on = DateTime.fromISO(onDate, { zone: "utc" });
  if (!born.isValid || !on.isValid) return false;
  // Born on 29 Feb: Luxon lands the birthday on 28 Feb in common years.
  return born.plus({ years: minAge }) <= on;
}

/** "18 de diciembre de 2026". */
export function formatCutoffDate(isoDate: string): string {
  return DateTime.fromISO(isoDate)
    .setLocale("es")
    .toFormat("d 'de' LLLL 'de' yyyy");
}

/** Applications are accepted up to and including the closing instant. */
export function isVolunteerCallOpen(
  applicationsCloseAt: Date,
  now: Date = new Date(),
): boolean {
  return now.getTime() <= applicationsCloseAt.getTime();
}

export type VolunteerSchemaContext = {
  /** Active roles of the festival being applied to. */
  roleIds: readonly number[];
  /** Active shifts of the festival being applied to. */
  shiftIds: readonly number[];
  /** From `volunteerAgeCutoffDate`. */
  ageCutoffDate: string;
  applicationsCloseAt: Date;
  /** Defaults to the moment the schema validates. */
  now?: () => Date;
};

const requiredText = (message: string, max = 200) =>
  z
    .string({ error: message })
    .trim()
    .min(1, message)
    .max(max, "Es demasiado largo");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Es demasiado largo")
    .optional()
    .transform((value) => (value ? value : null));

const phone = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .refine((value) => isPhoneValid(value), { error: message });

/** `true` only; react-hook-form starts the box at `false`. */
const consent = (message: string) =>
  z.boolean().refine((value) => value === true, { error: message });

const id = z.coerce.number({ error: "Elige una opción" }).int().positive({
  error: "Elige una opción",
});

/** The form's field groups, in the order a step-by-step form would ask them. */
export const VOLUNTEER_FORM_SECTIONS = [
  "personal",
  "shiftsAndRoles",
  "aboutYou",
  "emergencyAndCommitments",
] as const;
export type VolunteerFormSection = (typeof VOLUNTEER_FORM_SECTIONS)[number];

type SectionIssues = Parameters<Parameters<z.ZodObject["superRefine"]>[0]>[1];

/**
 * Each section's fields and its cross-field checks. The full schema is the
 * sections joined, so splitting the form into steps validates each step with
 * `buildVolunteerSectionSchema` and the server keeps the full one.
 */
function sectionDefinitions(ctx: VolunteerSchemaContext) {
  const roleIds = new Set(ctx.roleIds);
  const shiftIds = new Set(ctx.shiftIds);

  return {
    personal: {
      shape: {
        fullName: requiredText("Escribe tu nombre completo").pipe(
          z.string().min(3, "Escribe tu nombre completo"),
        ),
        birthdate: z
          .string({ error: "Indica tu fecha de nacimiento" })
          .trim()
          .regex(ISO_DATE, "Indica tu fecha de nacimiento")
          .refine((value) => DateTime.fromISO(value).isValid, {
            error: "La fecha no es válida",
          })
          .refine((value) => value >= "1900-01-01", {
            error: "La fecha no es válida",
          })
          .refine((value) => isOldEnoughOn(value, ctx.ageCutoffDate), {
            error: `Para ser voluntario/a necesitas tener ${VOLUNTEER_MIN_AGE} años cumplidos el ${formatCutoffDate(ctx.ageCutoffDate)}`,
          }),
        phone: phone("Ingresa un número de celular válido"),
        email: z
          .string({ error: "Ingresa tu email" })
          .trim()
          .toLowerCase()
          .max(254, "Es demasiado largo")
          .pipe(z.email({ error: "Ingresa un email válido" })),
        zone: optionalText(120),
      },
      refine: undefined,
    },
    shiftsAndRoles: {
      shape: {
        shiftIds: z
          .array(z.coerce.number().int().positive())
          .min(1, "Elige al menos un turno")
          .refine((ids) => ids.every((value) => shiftIds.has(value)), {
            error:
              "Uno de los turnos ya no está disponible. Recarga la página.",
          })
          .transform((ids) => [...new Set(ids)]),
        firstChoiceRoleId: id.refine((value) => roleIds.has(value), {
          error: "Ese rol ya no está disponible. Recarga la página.",
        }),
        secondChoiceRoleId: id.refine((value) => roleIds.has(value), {
          error: "Ese rol ya no está disponible. Recarga la página.",
        }),
      },
      refine: (
        values: { firstChoiceRoleId: number; secondChoiceRoleId: number },
        issues: SectionIssues,
      ) => {
        if (values.firstChoiceRoleId === values.secondChoiceRoleId) {
          issues.addIssue({
            code: "custom",
            path: ["secondChoiceRoleId"],
            message: "Tu 2ª opción tiene que ser distinta de la 1ª",
          });
        }
      },
    },
    aboutYou: {
      shape: {
        experience: z
          .array(z.enum(VOLUNTEER_EXPERIENCE_VALUES))
          .default([])
          .transform((values) => [...new Set(values)]),
        experienceNotes: optionalText(500),
        portfolio: optionalText(300),
        motivation: requiredText(
          "Cuéntanos por qué quieres ser voluntario/a",
          VOLUNTEER_MOTIVATION_MAX_LENGTH,
        ),
        referralSource: z.enum(VOLUNTEER_REFERRAL_VALUES, {
          error: "Elige una opción",
        }),
      },
      refine: undefined,
    },
    emergencyAndCommitments: {
      shape: {
        emergencyContactName: requiredText(
          "Escribe el nombre de tu contacto de emergencia",
        ),
        emergencyContactPhone: phone(
          "Ingresa un celular válido para tu contacto de emergencia",
        ),
        commitmentConsent: consent(VOLUNTEER_COPY.requiredCommitments),
        dataConsent: consent(VOLUNTEER_COPY.requiredCommitments),
        /** Optional: a preference that never blocks the application. */
        imageConsent: z.boolean().default(false),
        /** Honeypot: people never see it, so it stays empty. */
        website: z.string().max(500).optional().default(""),
      },
      refine: undefined,
    },
  } as const;
}

/** One section on its own, for validating a single step. */
export function buildVolunteerSectionSchema<S extends VolunteerFormSection>(
  ctx: VolunteerSchemaContext,
  section: S,
) {
  const definition = sectionDefinitions(ctx)[section];
  const schema = z.object(definition.shape);
  const refine = definition.refine as
    | ((values: unknown, issues: SectionIssues) => void)
    | undefined;
  return refine ? schema.superRefine(refine) : schema;
}

export function buildVolunteerApplicationSchema(ctx: VolunteerSchemaContext) {
  const sections = sectionDefinitions(ctx);
  const now = ctx.now ?? (() => new Date());

  return z
    .object({
      ...sections.personal.shape,
      ...sections.shiftsAndRoles.shape,
      ...sections.aboutYou.shape,
      ...sections.emergencyAndCommitments.shape,
    })
    .superRefine((values, issues) => {
      sections.shiftsAndRoles.refine(values, issues);
      if (!isVolunteerCallOpen(ctx.applicationsCloseAt, now())) {
        issues.addIssue({
          code: "custom",
          path: ["root"],
          message: VOLUNTEER_COPY.closedTitle,
        });
      }
    });
}

export type VolunteerApplicationSchema = ReturnType<
  typeof buildVolunteerApplicationSchema
>;
export type VolunteerApplicationInput = z.input<VolunteerApplicationSchema>;
export type VolunteerApplicationValues = z.output<VolunteerApplicationSchema>;
