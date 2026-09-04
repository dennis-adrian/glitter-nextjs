"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  activateFullTableAccess,
  deactivateFullTableAccess,
} from "@/app/lib/reservations/full-table-service";

const schema = z.object({
  festivalId: z.coerce.number().int().positive(),
  idempotencyKey: z.string().uuid(),
});

// Its own schema rather than the shared one: only deactivation accepts a
// target, and activation would silently ignore a `userId` a request sent it.
const deactivateSchema = schema.extend({
  /** Admin-only; the service refuses it from anybody else. */
  userId: z.coerce.number().int().positive().optional(),
});

function revalidateReservationEntry() {
  try {
    revalidatePath("/profiles", "layout");
  } catch (error) {
    console.error("[full-table] revalidatePath failed", error);
  }
}

/**
 * Participant-facing wrappers. The browser supplies only the festival and an
 * idempotency key — never a price, which the server reads from the festival's
 * own configuration.
 */
export async function activateFullTableAccessAction(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, message: "Datos inválidos." };
  }
  const result = await activateFullTableAccess(parsed.data);
  if (result.success) revalidateReservationEntry();
  return result.success
    ? { success: true as const, message: result.message }
    : { success: false as const, message: result.message };
}

export async function deactivateFullTableAccessAction(input: unknown) {
  const parsed = deactivateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, message: "Datos inválidos." };
  }
  const result = await deactivateFullTableAccess(parsed.data);
  if (result.success) revalidateReservationEntry();
  return result.success
    ? { success: true as const, message: result.message }
    : { success: false as const, message: result.message };
}
