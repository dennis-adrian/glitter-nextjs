import "server-only";

import { parse as legacyParse } from "url";
import webpush from "web-push";

import type { VapidConfig } from "@/app/lib/notifications/push/config";

/** A socket-idle timeout, as `web-push` has no overall deadline. */
const PUSH_REQUEST_TIMEOUT_MS = 10_000;
/**
 * How long a push service keeps a message for a device that is offline. The
 * inbox keeps everything anyway, so a week-old alert is noise.
 */
export const PUSH_TTL_SECONDS = 48 * 60 * 60;
/**
 * Apple asks for the VAPID token to be refreshed no more than once an hour.
 * `web-push` signs a new one per send, so one is kept per push service for
 * that long, and made to expire well after it stops being used.
 */
const AUTHORIZATION_REUSE_MS = 60 * 60 * 1000;
const JWT_LIFETIME_SECONDS = 12 * 60 * 60;

export type PushTarget = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type PushSendResult = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
};

type CachedAuthorization = {
  value: string;
  publicKey: string;
  expiresAt: number;
};

const authorizationByAudience = new Map<string, CachedAuthorization>();

function authorizationFor(audience: string, vapid: VapidConfig, now: number) {
  const cached = authorizationByAudience.get(audience);
  if (
    cached &&
    cached.publicKey === vapid.publicKey &&
    cached.expiresAt > now
  ) {
    return cached.value;
  }
  const { Authorization } = webpush.getVapidHeaders(
    audience,
    vapid.subject,
    vapid.publicKey,
    vapid.privateKey,
    "aes128gcm",
    Math.floor(now / 1000) + JWT_LIFETIME_SECONDS,
  );
  authorizationByAudience.set(audience, {
    value: Authorization,
    publicKey: vapid.publicKey,
    expiresAt: now + AUTHORIZATION_REUSE_MS,
  });
  return Authorization;
}

/**
 * Whether `web-push`, which reads the endpoint with Node's legacy `url.parse`,
 * would connect to the same host and port the WHATWG parser (and our
 * allowlist) saw. A second lock behind `isAllowedPushEndpoint`.
 */
export function legacyParserAgrees(endpoint: string): boolean {
  try {
    const whatwg = new URL(endpoint);
    const legacy = legacyParse(endpoint);
    return (
      legacy.protocol === "https:" &&
      legacy.hostname === whatwg.hostname &&
      legacy.port == null &&
      legacy.auth == null
    );
  } catch {
    return false;
  }
}

/**
 * Encrypts and sends one push. Rejects with `web-push`'s `WebPushError` for a
 * non-2xx answer and a plain `Error` when no answer came; the caller
 * classifies either. The endpoint must already be allowlisted.
 *
 * Never logs: the endpoint is a capability URL and the error carries it.
 */
export async function sendPush(
  target: PushTarget,
  payload: string,
  options: {
    vapid: VapidConfig;
    topic: string;
    /** What is left of the push's lifetime; never more than 48 h. */
    ttlSeconds: number;
  },
): Promise<PushSendResult> {
  if (!legacyParserAgrees(target.endpoint)) {
    throw new Error("push_endpoint_rejected");
  }
  const audience = new URL(target.endpoint).origin;
  const result = await webpush.sendNotification(target, payload, {
    TTL: Math.max(
      0,
      Math.min(PUSH_TTL_SECONDS, Math.floor(options.ttlSeconds)),
    ),
    urgency: "normal",
    topic: options.topic,
    timeout: PUSH_REQUEST_TIMEOUT_MS,
    // Passed as a header so the token is reused; with no `vapidDetails` set
    // the library adds none of its own.
    headers: {
      Authorization: authorizationFor(audience, options.vapid, Date.now()),
    },
  });
  return { statusCode: result.statusCode, headers: result.headers };
}
