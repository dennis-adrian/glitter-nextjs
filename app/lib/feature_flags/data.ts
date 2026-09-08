import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";

import type {
  FeatureFlagTarget,
  FeatureFlagWithTargets,
} from "@/app/lib/feature_flags/definitions";
import {
  FEATURE_FLAGS,
  FEATURE_FLAG_KEYS,
  type FeatureFlagKey,
} from "@/app/lib/feature_flags/registry";
import type { FeatureFlagRule } from "@/app/lib/feature_flags/visibility";
import { db } from "@/db";
import { featureFlagUserTargets, featureFlags, users } from "@/db/schema";

/**
 * Reads a flag row with its targeted users, creating the row at its registry
 * default the first time it is requested so adding a flag never needs a data
 * migration. `onConflictDoNothing` keeps concurrent first reads from racing on
 * the unique `key` constraint.
 *
 * Lives in a `server-only` data module (not the `use server` actions file) so it
 * isn't exposed as a callable server action. Follows
 * `app/lib/store_settings/data.ts`.
 */
export const fetchFeatureFlag = cache(
  async (key: FeatureFlagKey): Promise<FeatureFlagWithTargets> => {
    const flag = await fetchOrCreateFlagRow(key);
    const targets = await fetchFlagTargets(flag.id);

    return { ...flag, targets };
  },
);

async function fetchOrCreateFlagRow(key: FeatureFlagKey) {
  const existing = await db
    .select()
    .from(featureFlags)
    .where(eq(featureFlags.key, key))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const inserted = await db
    .insert(featureFlags)
    .values({ key, visibility: FEATURE_FLAGS[key].defaultVisibility })
    .onConflictDoNothing({ target: featureFlags.key })
    .returning();

  if (inserted.length > 0) {
    return inserted[0];
  }

  // A concurrent request inserted the row first; read it back.
  const [row] = await db
    .select()
    .from(featureFlags)
    .where(eq(featureFlags.key, key))
    .limit(1);

  /**
   * The insert conflicted, so a row existed a moment ago — finding none means
   * it was deleted in between. Without this the caller receives `undefined`
   * through a type that claims otherwise, and the failure surfaces one frame
   * later as a property access on undefined, naming neither the flag nor the
   * cause.
   */
  if (!row) {
    throw new Error(`Feature flag row for "${key}" vanished after insert`);
  }

  return row;
}

async function fetchFlagTargets(flagId: number): Promise<FeatureFlagTarget[]> {
  return db
    .select({
      id: featureFlagUserTargets.id,
      userId: featureFlagUserTargets.userId,
      note: featureFlagUserTargets.note,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(featureFlagUserTargets)
    .innerJoin(users, eq(users.id, featureFlagUserTargets.userId))
    .where(eq(featureFlagUserTargets.flagId, flagId))
    .orderBy(featureFlagUserTargets.createdAt);
}

/**
 * The evaluation input for one flag.
 *
 * If the row cannot be read, this falls back to the registry's declared
 * default with nobody targeted, rather than throwing. Two reasons that is the
 * right call here and not a papered-over error:
 *
 * - It is the same value `fetchOrCreateFlagRow` would have written had it been
 *   able to reach the database, so the fallback invents no new behaviour.
 * - Every default is `hidden` and the target list empties, so the failure is
 *   fail-closed: an unreachable database can only ever hide a feature, never
 *   reveal one.
 *
 * That keeps a prerender of a public page from dying on a flag lookup — during
 * `next build` without a database, or on a transient outage in production,
 * where the alternative is a 500 on a page that merely asked whether to show a
 * nav entry.
 *
 * Only the evaluation path degrades. `fetchFeatureFlag` and
 * `fetchAllFeatureFlags` still throw, because the admin screens that manage
 * flags must never render fabricated state as if it were stored.
 */
export async function fetchFeatureFlagRule(
  key: FeatureFlagKey,
): Promise<FeatureFlagRule> {
  try {
    const flag = await fetchFeatureFlag(key);

    return {
      visibility: flag.visibility,
      targetedUserIds: flag.targets.map((target) => target.userId),
    };
  } catch (error) {
    console.error(
      `fetchFeatureFlagRule("${key}"): could not read the flag, falling back ` +
        `to its registry default (${FEATURE_FLAGS[key].defaultVisibility}).`,
      error,
    );

    return {
      visibility: FEATURE_FLAGS[key].defaultVisibility,
      targetedUserIds: [],
    };
  }
}

/**
 * Every registered flag (creating any missing rows) in registry order, which
 * Promise.all preserves regardless of row-creation order. Rows whose key is no
 * longer in the registry are ignored.
 */
export async function fetchAllFeatureFlags(): Promise<
  FeatureFlagWithTargets[]
> {
  return Promise.all(FEATURE_FLAG_KEYS.map((key) => fetchFeatureFlag(key)));
}
