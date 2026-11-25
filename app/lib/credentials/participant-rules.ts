import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";

import { resolveRules } from "@/app/lib/credentials/calculate";
import {
  DEFAULT_CREDENTIAL_RULES,
  type CredentialRules,
} from "@/app/lib/credentials/definitions";
import { isFeatureLaunched } from "@/app/lib/feature_flags/helpers";
import { db } from "@/db";
import { festivalCredentialRules } from "@/db/schema";

/**
 * The credential rules participants read on the terms and payment pages.
 * The defaults unless the `festival_credentials` flag is public: while it is
 * hidden or admin-only, admins can rehearse a festival's rules without
 * changing what participants are told. Nothing is read from the rules table
 * until then.
 */
export const fetchParticipantCredentialRules = cache(
  async (festivalId: number): Promise<CredentialRules> => {
    if (!(await isFeatureLaunched("festival_credentials"))) {
      return DEFAULT_CREDENTIAL_RULES;
    }
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
