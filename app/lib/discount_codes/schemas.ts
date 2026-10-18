import { z } from "zod";

import {
  DISCOUNT_CODE_MAX_LENGTH,
  MAX_DISCOUNT_CODE_USERS,
} from "@/app/lib/discount_codes/utils";
import { moneyAmountSchema } from "@/app/lib/reservations/schemas";
import { discountCodeAudienceEnum, discountUnitEnum } from "@/db/schema";

const idSchema = z.number().int().positive().max(2_147_483_647);

/**
 * What an admin may write to a discount code. The format of the code itself
 * is checked by the actions, since a code saved before the format existed
 * must stay editable without being renamed.
 */
export const discountCodeInputSchema = z
  .object({
    code: z.string().trim().min(1).max(DISCOUNT_CODE_MAX_LENGTH),
    discountUnit: z.enum(discountUnitEnum.enumValues),
    discountValue: moneyAmountSchema.positive(),
    maxUses: idSchema.nullable(),
    festivalId: idSchema.nullable(),
    audience: z.enum(discountCodeAudienceEnum.enumValues),
    userIds: z.array(idSchema).max(MAX_DISCOUNT_CODE_USERS),
    expiresAt: z.coerce.date(),
    isActive: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.discountUnit === "percentage" && data.discountValue > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "Un porcentaje no puede superar el 100%.",
      });
    }
    if (data.audience === "selected_users" && data.userIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["userIds"],
        message: "Elegí al menos un usuario.",
      });
    }
  });

export type DiscountCodeInput = z.input<typeof discountCodeInputSchema>;

export const setDiscountCodeActiveSchema = z.object({
  id: idSchema,
  isActive: z.boolean(),
});
