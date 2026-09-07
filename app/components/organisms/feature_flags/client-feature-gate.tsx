"use client";

import type { ReactNode } from "react";

import { useFeatureFlag } from "@/app/components/organisms/feature_flags/feature-flag-provider";
import type { FeatureFlagKey } from "@/app/lib/feature_flags/registry";

type Props = {
  flag: FeatureFlagKey;
  children: ReactNode;
  /** Rendered when the feature is not visible. Defaults to nothing. */
  fallback?: ReactNode;
};

/**
 * `FeatureGate` for markup that lives inside a client component's own render
 * logic — inside a `.map()`, a tab panel, a conditionally mounted modal — where
 * the server cannot reach in to slot content.
 *
 * Requires a `<FeatureFlagProvider>` above it.
 *
 * Unlike the server `FeatureGate`, the gated markup ships to the browser inside
 * the client bundle; only its rendering is suppressed. That makes this a UI
 * affordance, not a secret keeper: never rely on it to hide unreleased copy or
 * data, and always gate the underlying server action with `featureFlagGuard`.
 */
export default function ClientFeatureGate({
  flag,
  children,
  fallback = null,
}: Props) {
  const enabled = useFeatureFlag(flag);

  return <>{enabled ? children : fallback}</>;
}
