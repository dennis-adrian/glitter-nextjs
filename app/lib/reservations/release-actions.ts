"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { releaseReservation } from "@/app/lib/reservations/release-service";

const schema = z.object({
  reservationId: z.coerce.number().int().positive(),
  idempotencyKey: z.string().uuid(),
});

/**
 * Participant-facing release (PRD §9).
 *
 * The browser supplies only which reservation and a retry key. The price comes
 * from the festival's own configuration, and ownership, status and balance are
 * all decided server-side — a request cannot name what it costs or whose
 * reservation it is.
 */
export async function releaseReservationAction(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, message: "Datos inválidos." };
  }

  const result = await releaseReservation(parsed.data);
  if (result.success) {
    try {
      // The stand is back on the map and the reservation is gone from their
      // participation, so both the participant's own pages and the admin
      // views of that festival are stale.
      revalidatePath("/profiles", "layout");
      revalidatePath("/my_participations", "page");
      revalidatePath("/dashboard/festivals/[id]/reservations", "page");
    } catch (error) {
      console.error("[release] revalidatePath failed", error);
    }
  }

  return result.success
    ? { success: true as const, message: result.message }
    : { success: false as const, message: result.message };
}
