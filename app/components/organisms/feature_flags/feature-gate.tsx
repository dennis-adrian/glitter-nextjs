import type { ReactNode } from "react";

import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import type { FeatureFlagKey } from "@/app/lib/feature_flags/registry";
import type { FeatureFlagViewer } from "@/app/lib/feature_flags/visibility";

type Props = {
  flag: FeatureFlagKey;
  children: ReactNode;
  /** Rendered when the feature is not visible. Defaults to nothing. */
  fallback?: ReactNode;
  /** Pass when the profile is already loaded, to skip re-resolving it. */
  viewer?: FeatureFlagViewer;
};

/**
 * Renders a section only when the viewer may see the feature, leaving the rest
 * of the page untouched. This is the gate for a *part* of an existing page — a
 * new activity type, an extra tab, one card in a dashboard.
 *
 * Use `requireFeatureEnabled` instead when the whole route should 404.
 *
 * Server component: the children are never sent to a viewer who cannot see
 * them, so this hides markup rather than just visually suppressing it.
 */
export default async function FeatureGate({
  flag,
  children,
  fallback = null,
  viewer,
}: Props) {
  const enabled = await isFeatureEnabled(flag, viewer);

  return <>{enabled ? children : fallback}</>;
}
