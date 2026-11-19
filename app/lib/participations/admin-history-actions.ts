"use server";

import { z } from "zod";

import type { AdminParticipationRow } from "@/app/lib/participations/admin-history";
import { fetchAdminParticipationHistory } from "@/app/lib/participations/admin-history-queries";
import { canViewAdminReservationData } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

const inputSchema = z.object({ userId: z.coerce.number().int().positive() });

/**
 * An account's participation history, loaded when an admin opens it from the
 * participants table rather than for every row of the page. Null when the
 * viewer may not read it, so the drawer can say so instead of showing an
 * account with no history.
 */
export async function fetchParticipationHistoryAction(
  input: unknown,
): Promise<AdminParticipationRow[] | null> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return null;
  const actor = await getCurrentUserProfile();
  if (!canViewAdminReservationData(actor)) return null;
  return fetchAdminParticipationHistory(parsed.data.userId);
}
