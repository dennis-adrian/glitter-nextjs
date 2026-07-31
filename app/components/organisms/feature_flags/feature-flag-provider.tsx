"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { FeatureFlagMap } from "@/app/lib/feature_flags/helpers";
import type { FeatureFlagKey } from "@/app/lib/feature_flags/registry";

const FeatureFlagContext = createContext<FeatureFlagMap | null>(null);

type Props = {
  /** Resolve on the server with `resolveFeatureFlagMap()` and pass it down. */
  flags: FeatureFlagMap;
  children: ReactNode;
};

/**
 * Makes already-resolved flag values available to a deep client tree without
 * prop drilling. Opt-in: mount it around the subtree that needs it, not
 * globally — the root layout should stay free of per-request data.
 *
 * Values are resolved once on the server, so this cannot leak the flag
 * configuration or another viewer's access.
 */
export default function FeatureFlagProvider({ flags, children }: Props) {
  return (
    <FeatureFlagContext.Provider value={flags}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

/**
 * Reads one flag inside a client component. Throws when no provider is mounted,
 * so a missing provider fails loudly instead of silently hiding a feature.
 */
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const flags = useContext(FeatureFlagContext);

  if (!flags) {
    throw new Error(
      "useFeatureFlag requires a <FeatureFlagProvider>. Resolve flags on the server with resolveFeatureFlagMap() and mount the provider around this subtree.",
    );
  }

  return flags[key];
}
