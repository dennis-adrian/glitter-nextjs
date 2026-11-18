"use server";

import { and, asc, eq, ilike, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { personName } from "@/app/lib/participations/admin-history";
import {
  previewParticipantTransfer,
  transferReservationParticipation,
} from "@/app/lib/reservations/participant-transfer-service";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { positiveIntSchema, uuidSchema } from "@/app/lib/reservations/schemas";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { users } from "@/db/schema";

const transferTargetSchema = z.object({
  reservationId: positiveIntSchema,
  fromUserId: positiveIntSchema,
  toUserId: positiveIntSchema,
});

const transferSchema = transferTargetSchema.extend({
  idempotencyKey: uuidSchema,
  note: z.string().trim().max(500).optional().nullable(),
  // Required here: the dialog always confirms a preview, and the command
  // refuses if what moves is no longer what that preview showed.
  planKey: z.string().min(1).max(10_000),
});

const searchSchema = z.object({
  query: z.string().trim().min(2).max(100),
  excludeUserId: positiveIntSchema,
});

export type TransferCandidate = {
  id: number;
  name: string;
  email: string;
  status: string;
};

/**
 * Participant accounts a participation could move to: anyone but the account
 * it comes from. Eligibility is judged by the preview, which can say why an
 * account does not qualify; filtering here would only hide the reason.
 */
export async function searchTransferCandidatesAction(
  input: unknown,
): Promise<TransferCandidate[]> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) return [];
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return [];

  const pattern = `%${parsed.data.query}%`;
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      status: users.status,
    })
    .from(users)
    .where(
      and(
        eq(users.role, "user"),
        ne(users.id, parsed.data.excludeUserId),
        or(
          ilike(users.displayName, pattern),
          ilike(users.firstName, pattern),
          ilike(users.lastName, pattern),
          ilike(users.email, pattern),
        ),
      ),
    )
    .orderBy(asc(users.displayName), asc(users.id))
    .limit(8);

  return rows.map((row) => ({
    id: row.id,
    name: personName(row),
    email: row.email,
    status: row.status,
  }));
}

export async function previewParticipantTransferAction(input: unknown) {
  const parsed = transferTargetSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, message: "Datos inválidos." };
  }
  return previewParticipantTransfer(parsed.data);
}

/**
 * Admin-only: moves one participation to another account. Revalidates both
 * accounts' admin pages, the reservation's own screens, and the participant
 * side, where the reservation leaves one account and appears on the other.
 */
export async function transferReservationParticipationAction(input: unknown) {
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, message: "Datos inválidos." };
  }

  const result = await transferReservationParticipation(parsed.data);
  if (result.success) {
    try {
      revalidatePath(`/dashboard/users/${parsed.data.fromUserId}`);
      revalidatePath(`/dashboard/users/${parsed.data.toUserId}`);
      revalidatePath("/dashboard/reservations/[id]/edit", "page");
      revalidatePath("/dashboard/festivals/[id]/reservations", "page");
      revalidatePath("/dashboard/festivals/[id]/payments", "page");
      revalidatePath("/profiles", "layout");
      revalidatePath("/my_participations", "layout");
      revalidatePath("/my_history");
    } catch (error) {
      console.error("[participant-transfer] revalidatePath failed", error);
    }
  }

  return result.success
    ? { success: true as const, message: result.message }
    : { success: false as const, message: result.message, code: result.code };
}
