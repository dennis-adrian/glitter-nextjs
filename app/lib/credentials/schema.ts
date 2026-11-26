import { z } from "zod";

import {
  CATEGORY_CREDENTIAL_GROUPS,
  CREDENTIAL_NAMING_MODES,
  CREDENTIAL_RULE_QUANTITY_MAX,
  EXTERNAL_CREDENTIAL_QUANTITY_MAX,
  EXTRA_LABEL_MAX,
  EXTRA_NAME_MAX,
  EXTRA_QUANTITY_MAX,
  POSTGRES_INT_MAX,
  PRINT_BATCH_MAX_HOLDERS,
  PRINT_BATCH_NAME_MAX,
  PRINT_BATCH_NOTE_MAX,
  STAFF_NAME_MAX,
  STAFF_ROLE_MAX,
} from "@/app/lib/credentials/definitions";

/** Inputs of every credentials action, each with its `z.input` type. */

const id = z.coerce
  .number({ error: "Revisá los datos e intentá de nuevo." })
  .int()
  .positive()
  .max(POSTGRES_INT_MAX);

const quantity = (max: number, label = "La cantidad") =>
  z.coerce
    .number({ error: `${label} tiene que ser un número.` })
    .int(`${label} tiene que ser un número entero.`)
    .min(0, `${label} no puede ser negativa.`)
    .max(max, `${label} puede ser como máximo ${max}.`);

const trimmed = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Escribí ${label}.`)
    .max(max, `${label[0]!.toUpperCase()}${label.slice(1)} puede tener hasta ${max} caracteres.`);

/* Rules ------------------------------------------------------------- */

const categoryRule = z.object({
  quantity: quantity(CREDENTIAL_RULE_QUANTITY_MAX),
  namingMode: z.enum(CREDENTIAL_NAMING_MODES, { error: "Elegí cuáles llevan nombre." }),
});
const otherRule = z.object({ quantity: quantity(CREDENTIAL_RULE_QUANTITY_MAX) });

export const credentialRulesFormSchema = z.object({
  illustration: categoryRule,
  entrepreneurship: categoryRule,
  gastronomy: categoryRule,
  external: otherRule,
  volunteer: otherRule,
  staff: otherRule,
});
export type CredentialRulesFormInput = z.input<typeof credentialRulesFormSchema>;
export type CredentialRulesFormValues = z.output<typeof credentialRulesFormSchema>;

export const saveCredentialRulesSchema = z.object({
  festivalId: id,
  rules: credentialRulesFormSchema,
});
export type SaveCredentialRulesInput = z.input<typeof saveCredentialRulesSchema>;

export const festivalOnlySchema = z.object({ festivalId: id });
export type FestivalOnlyInput = z.input<typeof festivalOnlySchema>;

/** Category groups, re-exported for the form's field order. */
export const RULE_FORM_CATEGORY_GROUPS = CATEGORY_CREDENTIAL_GROUPS;

/* External overrides ------------------------------------------------ */

export const externalCredentialQuantitySchema = z.object({
  festivalId: id,
  externalParticipantId: id,
  /** Null returns to the per-stand rule. */
  quantity: quantity(EXTERNAL_CREDENTIAL_QUANTITY_MAX).nullable(),
});
export type ExternalCredentialQuantityInput = z.input<
  typeof externalCredentialQuantitySchema
>;

/* The Glitter team -------------------------------------------------- */

export const staffMemberFieldsSchema = z.object({
  fullName: trimmed("el nombre", STAFF_NAME_MAX),
  roleLabel: z
    .string()
    .trim()
    .max(STAFF_ROLE_MAX, `El rol puede tener hasta ${STAFF_ROLE_MAX} caracteres.`),
});
export type StaffMemberFieldsInput = z.input<typeof staffMemberFieldsSchema>;

export const createStaffMemberSchema = staffMemberFieldsSchema.extend({
  festivalId: id,
  /** Tick the new member for this festival at once. */
  selectForFestival: z.boolean().default(true),
});
export type CreateStaffMemberInput = z.input<typeof createStaffMemberSchema>;

export const updateStaffMemberSchema = staffMemberFieldsSchema.extend({
  festivalId: id,
  staffMemberId: id,
});
export type UpdateStaffMemberInput = z.input<typeof updateStaffMemberSchema>;

export const staffMemberRefSchema = z.object({ festivalId: id, staffMemberId: id });
export type StaffMemberRefInput = z.input<typeof staffMemberRefSchema>;

export const festivalStaffMemberSchema = staffMemberRefSchema.extend({
  selected: z.boolean(),
});
export type FestivalStaffMemberInput = z.input<typeof festivalStaffMemberSchema>;

/* One-off credentials ----------------------------------------------- */

export const extraCredentialFieldsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("named"),
    name: trimmed("el nombre", EXTRA_NAME_MAX),
    label: trimmed("para qué es", EXTRA_LABEL_MAX),
  }),
  z.object({
    kind: z.literal("unnamed"),
    label: trimmed("para qué son", EXTRA_LABEL_MAX),
    quantity: quantity(EXTRA_QUANTITY_MAX).min(1, "La cantidad tiene que ser al menos 1."),
  }),
]);
export type ExtraCredentialFieldsInput = z.input<typeof extraCredentialFieldsSchema>;

export const addExtraCredentialSchema = z.object({
  festivalId: id,
  extra: extraCredentialFieldsSchema,
});
export type AddExtraCredentialInput = z.input<typeof addExtraCredentialSchema>;

/**
 * The name of a named entry cannot change (it is what was printed); only its
 * label, or a lot's label and quantity.
 */
export const updateExtraCredentialSchema = z.object({
  festivalId: id,
  extraCredentialId: id,
  label: trimmed("para qué es", EXTRA_LABEL_MAX),
  quantity: quantity(EXTRA_QUANTITY_MAX).min(1, "La cantidad tiene que ser al menos 1.").optional(),
});
export type UpdateExtraCredentialInput = z.input<typeof updateExtraCredentialSchema>;

export const extraCredentialRefSchema = z.object({ festivalId: id, extraCredentialId: id });
export type ExtraCredentialRefInput = z.input<typeof extraCredentialRefSchema>;

/* Print batches ----------------------------------------------------- */

const holderKey = z
  .string()
  .regex(/^(participant|external|volunteer|staff|extra):[1-9]\d{0,9}$/, {
    message: "Una de las personas elegidas no es válida. Actualizá la página.",
  });

/**
 * One holder as the dialog showed and exported it. The server recomputes the
 * name and counts and refuses the batch if they differ, so what is recorded
 * is what went to the printer, and a reprint is only recorded when one was
 * shown.
 */
const batchHolder = z.object({
  key: holderKey,
  /** The name the dialog showed and exported, to refuse a rename meanwhile. */
  name: z.string().max(PRINT_BATCH_NAME_MAX, "Una de las personas elegidas no es válida. Actualizá la página."),
  /**
   * The second line and the stand the CSV exported (a role, an extra's label,
   * "Comparte con…"), compared the same way: items record them as detail.
   */
  note: z.string().max(PRINT_BATCH_NAME_MAX, "Una de las personas elegidas no es válida. Actualizá la página.").nullable(),
  standLabel: z
    .string()
    .max(PRINT_BATCH_NAME_MAX, "Una de las personas elegidas no es válida. Actualizá la página.")
    .nullable(),
  named: quantity(POSTGRES_INT_MAX),
  unnamed: quantity(POSTGRES_INT_MAX),
  reprint: z.boolean(),
});

export const createPrintBatchSchema = z.object({
  festivalId: id,
  /**
   * The latest batch the dialog saw, null for none: any batch recorded or
   * undone since refuses the request, even when the counts still match, so
   * two admins cannot both record the same reprint.
   */
  lastBatchId: id.nullable(),
  holders: z
    .array(batchHolder)
    .min(1, "Elegí al menos una persona.")
    .max(PRINT_BATCH_MAX_HOLDERS, "Son demasiadas personas para un lote.")
    .refine((holders) => new Set(holders.map((holder) => holder.key)).size === holders.length, {
      message: "Hay personas repetidas. Actualizá la página.",
    }),
  note: z
    .string()
    .trim()
    .max(PRINT_BATCH_NOTE_MAX, `La nota puede tener hasta ${PRINT_BATCH_NOTE_MAX} caracteres.`)
    .optional()
    .transform((value) => (value ? value : null)),
});
export type CreatePrintBatchInput = z.input<typeof createPrintBatchSchema>;

export const printBatchRefSchema = z.object({ festivalId: id, batchId: id });
export type PrintBatchRefInput = z.input<typeof printBatchRefSchema>;
