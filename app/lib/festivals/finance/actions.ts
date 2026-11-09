"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  MAX_CREDIT_LEAD_DAYS,
  MIN_CREDIT_LEAD_DAYS,
} from "@/app/lib/festivals/finance/summary";
import { requireAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { financeFestivalSettings } from "@/db/schema";

const inputSchema = z.object({
  festivalId: z.number().int().positive(),
  leadDays: z.number().int().min(MIN_CREDIT_LEAD_DAYS).max(MAX_CREDIT_LEAD_DAYS),
});

export type UpdateCreditLeadDaysResult =
  | { success: true }
  | { success: false; message: string };

/**
 * Sets how many days before reservations open a credit purchase counts as
 * this festival's money. Admin-only, like the finance page itself.
 */
export async function updateCreditLeadDays(
  input: z.infer<typeof inputSchema>,
): Promise<UpdateCreditLeadDaysResult> {
  const profile = await requireAdmin();
  if (!profile) {
    return { success: false, message: "No tenés permiso para cambiar esto." };
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: `Elegí un número de días entre ${MIN_CREDIT_LEAD_DAYS} y ${MAX_CREDIT_LEAD_DAYS}.`,
    };
  }

  const { festivalId, leadDays } = parsed.data;
  try {
    await db
      .insert(financeFestivalSettings)
      .values({ festivalId, creditLeadDays: leadDays, updatedByUserId: profile.id })
      .onConflictDoUpdate({
        target: financeFestivalSettings.festivalId,
        set: {
          creditLeadDays: leadDays,
          updatedByUserId: profile.id,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error("Error updating credit lead days", error);
    return { success: false, message: "No se pudo guardar. Probá de nuevo." };
  }

  revalidatePath(`/dashboard/festivals/${festivalId}/finance`);
  return { success: true };
}
