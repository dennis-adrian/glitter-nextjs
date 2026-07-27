import type { BaseProfile } from "@/app/api/users/definitions";
import type { FeatureFlagVisibility } from "@/app/lib/feature_flags/definitions";

/**
 * Minimal viewer shape. `null` covers signed-out visitors, so callers can pass
 * the current profile straight through without a guard.
 */
export type FeatureFlagViewer =
  | Pick<BaseProfile, "id" | "role">
  | null
  | undefined;

/**
 * Everything needed to decide one flag: its visibility plus the users targeted
 * individually. Resolved by `data.ts` and evaluated here.
 */
export type FeatureFlagRule = {
  visibility: FeatureFlagVisibility;
  targetedUserIds: number[];
};

/**
 * Who may see a feature that has not launched yet. Matches the tier used by
 * `requireAdminOrFestivalAdmin`, so a festival admin previewing a feature sees
 * what they would be able to administer.
 */
export function canPreviewUnlaunchedFeatures(
  viewer: FeatureFlagViewer,
): boolean {
  return viewer?.role === "admin" || viewer?.role === "festival_admin";
}

/** Whether this viewer was individually allowlisted for the flag. */
export function isTargetedUser(
  rule: FeatureFlagRule,
  viewer: FeatureFlagViewer,
): boolean {
  if (!viewer) return false;
  return rule.targetedUserIds.includes(viewer.id);
}

/**
 * The whole rule. Pure on purpose: every gate — server components, server
 * actions, route handlers — resolves through this one function, so the UI can
 * never disagree with the enforcement.
 *
 * Targeting is evaluated before visibility, the way ConfigCat evaluates
 * targeting rules before the fallback value. A targeted user therefore sees the
 * feature even while it is `hidden` — that is the point of targeting. There is
 * no deny list, so targeting can only ever grant access, never remove it.
 */
export function isFeatureVisible(
  rule: FeatureFlagRule,
  viewer: FeatureFlagViewer,
): boolean {
  if (isTargetedUser(rule, viewer)) return true;

  switch (rule.visibility) {
    case "hidden":
      return false;
    case "admin_only":
      return canPreviewUnlaunchedFeatures(viewer);
    case "public":
      return true;
  }
}
