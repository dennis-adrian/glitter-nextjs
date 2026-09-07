"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  createDebtCreditTopUp,
  createFeatureCreditTopUp,
  PURCHASABLE_FEATURE_TYPES,
  type CreditPurchaseResult,
} from "@/app/lib/credits/purchase-service";
import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";

/**
 * The features this action can price on its own.
 *
 * `late_partner` is deliberately absent. Its cost is the configured fee *plus*
 * the shared-price difference of one specific reservation, which only
 * `createLatePartnerCreditTopUpAction` can work out — routed through here it
 * would open an undersized top-up, and that top-up then blocks the correct one
 * as the open purchase for the feature.
 */
const GENERICALLY_PRICED_FEATURES = PURCHASABLE_FEATURE_TYPES.filter(
  (type) => type !== "late_partner",
) as Exclude<(typeof PURCHASABLE_FEATURE_TYPES)[number], "late_partner">[];

const featureSchema = z.object({
  festivalId: z.coerce.number().int().positive(),
  featureType: z.enum(GENERICALLY_PRICED_FEATURES),
  idempotencyKey: z.uuid(),
});

const debtSchema = z.object({
  idempotencyKey: z.uuid(),
});

export type CreditPurchaseActionResult =
  | {
      success: true;
      message: string;
      topUpId: number;
      amount: number;
      uploadDeadlineAt: string;
    }
  | { success: false; message: string };

function toActionResult(
  result: CreditPurchaseResult,
): CreditPurchaseActionResult {
  if (!result.success) {
    return { success: false, message: result.message };
  }
  revalidatePath("/my_credits");
  return {
    success: true,
    message: result.message,
    topUpId: result.data.topUpId,
    amount: result.data.amount,
    uploadDeadlineAt: result.data.uploadDeadlineAt,
  };
}

/**
 * Participant-facing wrappers. The browser supplies what it wants to fund and
 * an idempotency key — never an amount. The server prices the feature from the
 * festival's configuration and sizes the purchase from the ledger.
 */
export async function createFeatureCreditTopUpAction(
  input: unknown,
): Promise<CreditPurchaseActionResult> {
  const blocked = await featureFlagGuard("credits");
  if (blocked) return blocked;

  const parsed = featureSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }
  return toActionResult(await createFeatureCreditTopUp(parsed.data));
}

export async function createDebtCreditTopUpAction(
  input: unknown,
): Promise<CreditPurchaseActionResult> {
  const blocked = await featureFlagGuard("credits");
  if (blocked) return blocked;

  const parsed = debtSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }
  return toActionResult(await createDebtCreditTopUp(parsed.data));
}
