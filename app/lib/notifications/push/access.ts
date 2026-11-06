import "server-only";

import {
  isFeatureEnabled,
  isLayoutFeatureEnabled,
} from "@/app/lib/feature_flags/helpers";
import type { FeatureFlagViewer } from "@/app/lib/feature_flags/visibility";
import { pushPublicKey } from "@/app/lib/notifications/push/config";

/**
 * Whether avisos are open to this viewer: both flags, since tapping one opens
 * the inbox item. Whether this environment has keys is a separate question;
 * see `pushPublicKey`.
 */
export async function isPushEnabledFor(viewer: FeatureFlagViewer) {
  const [inbox, push] = await Promise.all([
    isFeatureEnabled("notifications", viewer),
    isFeatureEnabled("push_notifications", viewer),
  ]);
  return inbox && push;
}

/**
 * The key a client control subscribes with, or null when it should not offer
 * avisos: flags off for this viewer, or no keys in this environment.
 */
export async function pushPublicKeyFor(viewer: FeatureFlagViewer) {
  return (await isPushEnabledFor(viewer)) ? pushPublicKey() : null;
}

/** `pushPublicKeyFor` for the navbar, which also renders on static pages. */
export async function layoutPushPublicKey() {
  const [inbox, push] = await Promise.all([
    isLayoutFeatureEnabled("notifications"),
    isLayoutFeatureEnabled("push_notifications"),
  ]);
  return inbox && push ? pushPublicKey() : null;
}
