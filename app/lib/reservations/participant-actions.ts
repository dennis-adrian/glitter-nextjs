"use server";

import { searchPotentialPartnersForActor } from "@/app/lib/reservations/partner-search";
import { consumeActionRateLimit } from "@/app/lib/rate-limit";
import { parseUnknown, positiveIntSchema } from "@/app/lib/reservations/schemas";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { z } from "zod";

const partnerSearchSchema = z.object({
  festivalId: positiveIntSchema,
  query: z.string().trim().min(2).max(80),
});

export async function searchPotentialPartners(
  festivalIdInput: unknown,
  queryInput: unknown,
) {
  const actor = await getCurrentUserProfile();
  if (!actor) return [];

  const parsed = parseUnknown(partnerSearchSchema, {
    festivalId: festivalIdInput,
    query: queryInput,
  });
  if (!parsed.success) return [];

  const allowed = await consumeActionRateLimit({
    key: `partner-search:user:${actor.id}`,
    limit: 30,
    windowMs: 60_000,
  }).catch(() => false);
  if (!allowed) return [];

  return searchPotentialPartnersForActor(
    parsed.data.festivalId,
    parsed.data.query,
  );
}
