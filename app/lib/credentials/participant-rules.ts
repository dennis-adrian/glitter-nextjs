import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";

import { resolveRules } from "@/app/lib/credentials/calculate";
import type { CredentialRules } from "@/app/lib/credentials/definitions";
import { db } from "@/db";
import { festivalCredentialRules } from "@/db/schema";

/**
 * The credential rules participants read on the terms and payment pages:
 * the festival's own rules over the defaults, so a festival without rules of
 * its own reads exactly what these pages always said.
 */
export const fetchParticipantCredentialRules = cache(
  async (festivalId: number): Promise<CredentialRules> => {
    const rows = await db
      .select({
        group: festivalCredentialRules.group,
        quantity: festivalCredentialRules.quantity,
        namingMode: festivalCredentialRules.namingMode,
      })
      .from(festivalCredentialRules)
      .where(eq(festivalCredentialRules.festivalId, festivalId));
    return resolveRules(rows);
  },
);
