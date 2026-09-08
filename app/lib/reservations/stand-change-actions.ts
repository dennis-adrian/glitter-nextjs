"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { changeReservationStand } from "@/app/lib/reservations/stand-change-service";
import { positiveIntSchema, uuidSchema } from "@/app/lib/reservations/schemas";

const changeStandSchema = z.object({
  reservationId: positiveIntSchema,
  destinationStandId: positiveIntSchema,
  idempotencyKey: uuidSchema,
  /**
   * The admin's explicit decision to move two reservations instead of one.
   * Absent, an occupied destination is refused rather than exchanged — the
   * server is the one that decides a stand is occupied, so the confirmation
   * has to be checked here and not only in the dialog that collected it.
   */
  allowExchange: z.boolean().optional(),
});

/**
 * Admin-only stand switch and exchange (PRD: Admin Stand Switch, Exchange and
 * Full-Table Assignment, §4 and §5).
 *
 * Revalidates every screen either stand can appear on: the reservation being
 * edited, the admin reservation list and payments dashboard, and the
 * participant-facing map, where a freed stand has to become selectable again
 * and an occupied one has to stop being.
 */
export async function changeReservationStandAction(input: unknown) {
  const parsed = changeStandSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, message: "Datos inválidos." };
  }

  const result = await changeReservationStand(parsed.data);
  if (result.success) {
    try {
      revalidatePath("/dashboard/reservations/[id]/edit", "page");
      revalidatePath("/dashboard/festivals/[id]/reservations", "page");
      revalidatePath("/dashboard/festivals/[id]/payments", "page");
      revalidatePath("/profiles", "layout");
    } catch (error) {
      console.error("[stand-change] revalidatePath failed", error);
    }
  }

  return result.success
    ? {
        success: true as const,
        message: result.message,
        mode: result.data.mode,
      }
    : { success: false as const, message: result.message, code: result.code };
}
