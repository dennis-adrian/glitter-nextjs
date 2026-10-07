import posthog from "posthog-js";

import type { PostHogEvent } from "@/app/lib/posthog-events";

/** Where posthog-js records whether `identify` ran ("anonymous" | "identified"). */
const USER_STATE = "$user_state";

/**
 * `posthog.capture` is not exception-safe: the SDK invokes every `before_send`
 * hook without a `try`, so a throw there escapes into the caller.
 *
 * That matters because most of our captures sit inside the `try` of a checkout
 * or upload handler, ahead of the success path. An analytics failure there would
 * jump to the `catch`, tell the payer their voucher or reservation failed, and
 * skip the redirect — all while the server had already accepted it. Telemetry
 * must never be able to fail a transaction it is only observing.
 *
 * Client-only: importing `posthog-js` from a module that server code also pulls
 * in would drag the browser SDK into the server bundle. Server-side captures go
 * through `getPostHogClient` in `posthog-server.ts` instead.
 */
export function captureClientEvent(
  event: PostHogEvent,
  properties?: Record<string, unknown>,
): void {
  try {
    posthog.capture(event, properties);
  } catch (error) {
    // Swallowed on purpose — see above. Logged so a broken hook is still
    // discoverable rather than silently dropping every event.
    console.error("[posthog] capture failed", { event, error });
  }
}

/**
 * `identify` emits an `$identify` event, so it runs the same `before_send` path
 * and can throw for the same reason. It is called from effects, where an
 * uncaught throw unmounts the tree into the nearest error boundary.
 */
export function identifyClientUser(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  try {
    posthog.identify(distinctId, properties);
  } catch (error) {
    console.error("[posthog] identify failed", error);
  }
}

/**
 * Sign-out counterpart to {@link identifyClientUser}: clears an identity that
 * `identify` set, and nothing else.
 *
 * An anonymous visitor has nothing to clear, and resetting them is costly:
 * `reset()` wipes the stored campaign params (`utm_*`), issues a new distinct
 * id and starts a new session. Run on every signed-out page load, it split the
 * pageview that landed a visitor from an email from everything they did next,
 * so no registration could be traced back to the campaign that brought it.
 */
export function resetClientIdentity(): void {
  try {
    if (posthog.get_property(USER_STATE) !== "identified") return;
    posthog.reset();
  } catch (error) {
    console.error("[posthog] reset failed", error);
  }
}
