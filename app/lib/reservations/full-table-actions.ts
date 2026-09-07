"use server";

import { revalidatePath } from "next/cache";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { z } from "zod";

import {
  activateFullTableAccess,
  deactivateFullTableAccess,
  downgradeFullTableReservation,
} from "@/app/lib/reservations/full-table-service";

const schema = z.object({
  festivalId: z.coerce.number().int().positive(),
  idempotencyKey: z.string().uuid(),
});

// Its own schema rather than the shared one: a downgrade names a reservation,
// not a festival, and the participant-facing pair has no reservation to name.
const downgradeSchema = z.object({
  reservationId: z.coerce.number().int().positive(),
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
  // The feature is paid for in credits, so hiding the wallet has to withdraw
  // this too. Without the guard the map's activation button stayed live behind
  // a flag that was meant to have taken it away.
  const blocked = await featureFlagGuard("credits");
  if (blocked) return blocked;

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

/**
 * Admin-only manual downgrade (PRD §7.7, §13).
 *
 * The sanctioned resolution when the credits behind a full table are reversed:
 * the reservation keeps the half the participant picked and the companion goes
 * back on the map. Every screen that could show either stand is revalidated —
 * the admin's own reservation list and payments dashboard, and the participant
 * map, where the freed half has to become selectable again.
 */
export async function downgradeFullTableReservationAction(input: unknown) {
  const parsed = downgradeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, message: "Datos inválidos." };
  }
  const result = await downgradeFullTableReservation(parsed.data);
  if (result.success) {
    revalidateReservationEntry();
    try {
      revalidatePath("/dashboard/reservations/[id]/edit", "page");
      revalidatePath("/dashboard/festivals/[id]/reservations", "page");
      revalidatePath("/dashboard/festivals/[id]/payments", "page");
    } catch (error) {
      console.error("[full-table] revalidatePath failed", error);
    }
  }
  return result.success
    ? { success: true as const, message: result.message }
    : { success: false as const, message: result.message };
}
