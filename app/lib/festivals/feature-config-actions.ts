"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  FEATURE_TYPES,
  FULL_TABLE_CATEGORIES,
} from "@/app/lib/festivals/feature-config";
import { upsertFestivalFeatureConfig } from "@/app/lib/festivals/feature-config-service";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

const schema = z.object({
  festivalId: z.coerce.number().int().positive(),
  type: z.enum(FEATURE_TYPES),
  category: z.enum(FULL_TABLE_CATEGORIES).nullable(),
  enabled: z.boolean(),
  creditPrice: z.coerce
    .number()
    .finite()
    .multipleOf(0.01)
    .min(0)
    .max(99_999_999.99),
  /** ISO string or null; only late partner accepts one. */
  deadlineOverrideAt: z.string().datetime().nullable(),
});

/**
 * Configures one reservation feature for a festival. Global admin only:
 * festival admins stay read-only here, matching the rest of the reservation
 * admin surface.
 */
export async function upsertFestivalFeatureConfigAction(
  input: unknown,
): Promise<{ success: boolean; message: string }> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return { success: false, message: "No autorizado." };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: "Revisá los datos: el precio admite hasta dos decimales.",
    };
  }

  try {
    const result = await upsertFestivalFeatureConfig({
      ...parsed.data,
      deadlineOverrideAt: parsed.data.deadlineOverrideAt
        ? new Date(parsed.data.deadlineOverrideAt)
        : null,
      updatedByUserId: actor.id,
    });
    if (!result.ok) {
      return {
        success: false,
        message:
          result.code === "INVALID_SCOPE"
            ? "Esa combinación de función y categoría no es válida."
            : "El precio no es válido.",
      };
    }

    revalidatePath("/dashboard/festivals");
    return { success: true, message: "Configuración guardada." };
  } catch (error) {
    console.error("Error saving festival feature config", error);
    return { success: false, message: "Error al guardar la configuración." };
  }
}
