import "server-only";

import { notFound } from "next/navigation";

import { fetchFeatureFlagRule } from "@/app/lib/feature_flags/data";
import {
  FEATURE_FLAG_KEYS,
  type FeatureFlagKey,
} from "@/app/lib/feature_flags/registry";
import {
  isFeatureVisible,
  type FeatureFlagViewer,
} from "@/app/lib/feature_flags/visibility";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

/** Resolved flag values for the current viewer, for handing to client code. */
export type FeatureFlagMap = Record<FeatureFlagKey, boolean>;

/**
 * Whether the current viewer may see a feature. Resolves the signed-in profile
 * itself, so callers do not have to.
 *
 * Pass `viewer` explicitly only where the profile has already been loaded and
 * you want to avoid the extra resolution — the result is identical.
 */
export async function isFeatureEnabled(
  key: FeatureFlagKey,
  viewer?: FeatureFlagViewer,
): Promise<boolean> {
  const [rule, profile] = await Promise.all([
    fetchFeatureFlagRule(key),
    viewer === undefined ? getCurrentUserProfile() : Promise.resolve(viewer),
  ]);

  return isFeatureVisible(rule, profile);
}

/**
 * Route-level gate: renders the 404 page when the feature is not visible to the
 * current viewer. Use at the top of a page or layout so an unlaunched feature
 * is indistinguishable from a URL that does not exist.
 *
 * For a section *inside* an otherwise normal page, use `<FeatureGate>` instead —
 * this one takes the whole route down.
 */
export async function requireFeatureEnabled(
  key: FeatureFlagKey,
  viewer?: FeatureFlagViewer,
): Promise<void> {
  if (!(await isFeatureEnabled(key, viewer))) {
    notFound();
  }
}

/**
 * Server-action gate. Returns an error result to hand straight back to the
 * client when the feature is off, or `null` when the action may proceed:
 *
 * ```ts
 * const blocked = await featureFlagGuard("sticker_hunt_v2");
 * if (blocked) return blocked;
 * ```
 *
 * This is the enforcement boundary. Hidden UI is a courtesy — the action is
 * reachable by anyone who can craft the request, so every mutation behind a flag
 * needs this. `requireFeatureEnabled` is the wrong tool here: `notFound()` in an
 * action produces a confusing response rather than a usable error.
 */
export async function featureFlagGuard(
  key: FeatureFlagKey,
  viewer?: FeatureFlagViewer,
): Promise<{ success: false; message: string } | null> {
  if (await isFeatureEnabled(key, viewer)) return null;

  return {
    success: false,
    message: "Esta funcionalidad no está disponible",
  } as const;
}

/**
 * Every flag resolved for the current viewer. Pass the result to
 * `<FeatureFlagProvider>` when a deep client tree needs flags without prop
 * drilling. Server code should prefer `isFeatureEnabled` for a single flag.
 */
export async function resolveFeatureFlagMap(
  viewer?: FeatureFlagViewer,
): Promise<FeatureFlagMap> {
  const profile = viewer === undefined ? await getCurrentUserProfile() : viewer;

  const entries = await Promise.all(
    FEATURE_FLAG_KEYS.map(
      async (key) => [key, await isFeatureEnabled(key, profile)] as const,
    ),
  );

  return Object.fromEntries(entries) as FeatureFlagMap;
}
