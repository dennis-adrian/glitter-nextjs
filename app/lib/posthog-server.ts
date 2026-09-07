import { PostHog } from "posthog-node";
import { getClientEnv, serverEnv } from "@/env";
import type { PostHogEvent } from "@/app/lib/posthog-events";

const noop = new Proxy({} as PostHog, {
  get: () => async () => {},
});

/**
 * How long `shutdown()` may block before the caller gives up on the flush.
 *
 * Every capture in this app is awaited inside a request or a server action,
 * *after* the work it reports has already been committed. `shutdown()` defaults
 * to 30 seconds, so an unreachable PostHog would hold the response open for
 * half a minute and then, past `vercel.json`'s `maxDuration`, hand the user an
 * error for an operation that in fact succeeded. Wrapping the capture in
 * try/catch does not help: the failure mode is a hang, not a throw.
 *
 * Five seconds is far above a healthy flush — the client is configured
 * `flushAt: 1, flushInterval: 0`, so the event is already in flight — and far
 * below anything a person would wait through.
 */
export const POSTHOG_SHUTDOWN_TIMEOUT_MS = 5_000;

export function getPostHogClient(): PostHog {
  if (serverEnv.VERCEL_ENV !== "production") return noop;
  return new PostHog(getClientEnv().NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
    host: getClientEnv().NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });
}

export async function captureServerEvent(input: {
  distinctId: string;
  event: PostHogEvent;
  properties?: Record<string, unknown>;
  context: string;
}): Promise<void> {
  try {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: input.distinctId,
      event: input.event,
      properties: input.properties,
    });
    await posthog.shutdown(POSTHOG_SHUTDOWN_TIMEOUT_MS);
  } catch (error) {
    console.error(`[posthog] ${input.context} capture failed`, {
      event: input.event,
      error,
    });
  }
}
