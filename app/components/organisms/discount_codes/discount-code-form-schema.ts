import { z } from "zod";

import type {
  DiscountCodeUser,
  DiscountCodeWithRelations,
} from "@/app/lib/discount_codes/definitions";
import type { DiscountCodeInput } from "@/app/lib/discount_codes/schemas";
import {
  DISCOUNT_CODE_MAX_LENGTH,
  expiryDayToTimestamp,
  isValidDiscountCodeFormat,
  MAX_DISCOUNT_CODE_USERS,
  normalizeDiscountCode,
  storeDay,
  timestampToExpiryDay,
} from "@/app/lib/discount_codes/utils";
import { discountCodeAudienceEnum, discountUnitEnum } from "@/db/schema";

/** What the form starts from when editing; nothing when creating. */
export type DiscountCodeFormOrigin = Pick<
  DiscountCodeWithRelations,
  "code" | "expiresAt" | "currentUses"
>;

function isAmount(value: string) {
  const amount = Number(value);
  return value.trim() !== "" && Number.isFinite(amount);
}

function hasAtMostTwoDecimals(value: string) {
  return /^\d+(\.\d{1,2})?$/.test(value.trim());
}

/**
 * Every input holds the string it shows, and is turned into the action's
 * types only on submit. Coercing in the schema instead left `undefined` in
 * empty number inputs, which React reads as uncontrolled.
 */
export function buildDiscountCodeFormSchema(
  origin?: DiscountCodeFormOrigin,
  today: string = storeDay(),
) {
  const originalDay = origin ? timestampToExpiryDay(origin.expiresAt) : null;

  return z
    .object({
      code: z
        .string()
        .trim()
        .min(1, "El código es requerido")
        .max(
          DISCOUNT_CODE_MAX_LENGTH,
          `Usá hasta ${DISCOUNT_CODE_MAX_LENGTH} caracteres`,
        ),
      discountUnit: z.enum(discountUnitEnum.enumValues),
      discountValue: z
        .string()
        .trim()
        .min(1, "El valor es requerido")
        .refine(
          (value) => isAmount(value) && Number(value) > 0,
          "El valor debe ser mayor a 0",
        )
        .refine(hasAtMostTwoDecimals, "Usá como máximo dos decimales"),
      maxUses: z
        .string()
        .trim()
        .refine(
          (value) =>
            value === "" ||
            (/^\d+$/.test(value) &&
              Number(value) > 0 &&
              Number(value) <= 2_147_483_647),
          "Ingresá un número entero mayor a 0",
        ),
      festivalId: z.string(),
      audience: z.enum(discountCodeAudienceEnum.enumValues),
      assignedUsers: z
        .array(z.custom<DiscountCodeUser>())
        .max(
          MAX_DISCOUNT_CODE_USERS,
          `Elegí hasta ${MAX_DISCOUNT_CODE_USERS} usuarios`,
        ),
      expiresOn: z.string().min(1, "La fecha de vencimiento es requerida"),
      isActive: z.boolean(),
    })
    .superRefine((data, ctx) => {
      // A code saved before the format existed may keep its name.
      const renamed =
        !origin ||
        normalizeDiscountCode(data.code) !== normalizeDiscountCode(origin.code);
      if (renamed && !isValidDiscountCodeFormat(data.code)) {
        ctx.addIssue({
          code: "custom",
          path: ["code"],
          message: "Usá solo letras, números, guiones o guiones bajos",
        });
      }
      if (
        data.discountUnit === "percentage" &&
        isAmount(data.discountValue) &&
        Number(data.discountValue) > 100
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["discountValue"],
          message: "Un porcentaje no puede superar el 100%",
        });
      }
      if (
        origin &&
        data.maxUses !== "" &&
        Number(data.maxUses) < origin.currentUses
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["maxUses"],
          message: `Ya se usó ${origin.currentUses} ${origin.currentUses === 1 ? "vez" : "veces"}; el límite no puede ser menor`,
        });
      }
      if (
        data.audience === "selected_users" &&
        data.assignedUsers.length === 0
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["assignedUsers"],
          message: "Agregá al menos un usuario",
        });
      }
      // Left alone, an expired code stays editable; a date someone picks
      // has to be one the code can still be used on.
      if (data.expiresOn !== originalDay && data.expiresOn < today) {
        ctx.addIssue({
          code: "custom",
          path: ["expiresOn"],
          message: "La fecha no puede ser anterior a hoy",
        });
      }
    });
}

export type DiscountCodeFormValues = z.input<
  ReturnType<typeof buildDiscountCodeFormSchema>
>;

export function discountCodeFormDefaults(
  discountCode?: DiscountCodeWithRelations,
): DiscountCodeFormValues {
  return {
    code: discountCode?.code.toUpperCase() ?? "",
    discountUnit: discountCode?.discountUnit ?? "percentage",
    discountValue:
      discountCode != null ? String(discountCode.discountValue) : "",
    maxUses: discountCode?.maxUses != null ? String(discountCode.maxUses) : "",
    festivalId:
      discountCode?.festivalId != null ? String(discountCode.festivalId) : "",
    audience: discountCode?.audience ?? "everyone",
    assignedUsers: discountCode?.assignedUsers ?? [],
    expiresOn: discountCode ? timestampToExpiryDay(discountCode.expiresAt) : "",
    isActive: discountCode?.isActive ?? true,
  };
}

/**
 * The action's input. An untouched expiry is sent back as stored, so saving
 * an unrelated change never moves a code's deadline.
 */
export function toDiscountCodeInput(
  values: DiscountCodeFormValues,
  origin?: DiscountCodeFormOrigin,
): DiscountCodeInput {
  const storedExpiry =
    origin != null &&
    values.expiresOn === timestampToExpiryDay(origin.expiresAt)
      ? new Date(origin.expiresAt)
      : null;
  const restricted = values.audience === "selected_users";

  return {
    code: values.code.trim(),
    discountUnit: values.discountUnit,
    discountValue: Number(values.discountValue),
    maxUses: values.maxUses.trim() === "" ? null : Number(values.maxUses),
    festivalId: values.festivalId ? Number(values.festivalId) : null,
    audience: values.audience,
    userIds: restricted ? values.assignedUsers.map((user) => user.id) : [],
    // An invalid date is refused by the action's schema, as it should be.
    expiresAt:
      storedExpiry ??
      expiryDayToTimestamp(values.expiresOn) ??
      new Date(Number.NaN),
    isActive: values.isActive,
  };
}
