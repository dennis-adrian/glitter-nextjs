/**
 * What one push attempt means for its delivery row. Kept apart from the
 * transport so tests that mock `web-push` still run the real classification,
 * as `resend-result.ts` does for email.
 *
 * `error` is what goes in `last_error`: a status or a type, never the
 * endpoint or the response body, which can echo it.
 */
export type PushAttemptResult =
  | { kind: "sent"; providerMessageId: string | null }
  /** 404/410: the browser dropped the subscription. Remove the device. */
  | { kind: "gone"; error: string }
  /** Retry with backoff, or later if the service asked for that. */
  | { kind: "retry"; error: string; retryAfterMs: number | null }
  /**
   * A request the service will never accept as built: bad VAPID or JWT, a
   * payload too large. The device is kept, since a misconfiguration would
   * otherwise wipe every device at once.
   */
  | { kind: "failed"; error: string };

type HeaderValue = string | string[] | number | undefined;
type Headers = Record<string, HeaderValue> | undefined;

function header(headers: Headers, name: string): string | null {
  const value = headers?.[name.toLowerCase()];
  if (value == null) return null;
  return (Array.isArray(value) ? value[0] : String(value)) ?? null;
}

/** RFC 9110 Retry-After: delay seconds or an HTTP date. */
export function parseRetryAfter(
  value: string | null,
  now: Date = new Date(),
): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - now.getTime());
}

export function classifyPushResponse(response: {
  statusCode: number;
  headers?: Headers;
}): PushAttemptResult {
  // Apple answers with an `apns-id`; FCM and the others with a `Location`.
  const messageId =
    header(response.headers, "apns-id") ?? header(response.headers, "location");
  return {
    kind: "sent",
    providerMessageId: messageId ? messageId.slice(0, 200) : null,
  };
}

/**
 * `web-push` rejects with a `WebPushError` (`statusCode`, `headers`, `body`,
 * `endpoint`) for any non-2xx answer, and with a plain `Error` when the
 * request never got one.
 */
export function classifyPushError(
  error: unknown,
  now: Date = new Date(),
): PushAttemptResult {
  const statusCode =
    error && typeof error === "object" && "statusCode" in error
      ? Number((error as { statusCode: unknown }).statusCode)
      : null;

  if (statusCode == null || !Number.isInteger(statusCode)) {
    const message = error instanceof Error ? error.message : "";
    return {
      kind: "retry",
      error: /timeout/i.test(message) ? "push_timeout" : "push_network",
      retryAfterMs: null,
    };
  }

  const code = `push_${statusCode}`;
  if (statusCode === 404 || statusCode === 410) {
    return { kind: "gone", error: code };
  }
  if (statusCode === 429) {
    const headers = (error as { headers?: Headers }).headers;
    return {
      kind: "retry",
      error: code,
      retryAfterMs: parseRetryAfter(header(headers, "retry-after"), now),
    };
  }
  if (statusCode >= 500 || statusCode === 408) {
    return { kind: "retry", error: code, retryAfterMs: null };
  }
  return { kind: "failed", error: code };
}
