import type { ErrorResponse } from "resend";

/**
 * Reading a `sendEmail` result.
 *
 * Resend resolves a rejected send — validation, rate limit, quota, outage —
 * as `{ error }` instead of throwing; only `sendEmail`'s own timeout rejects.
 * A caller that only awaits the promise reports every one of those as sent.
 *
 * Kept apart from `resend.ts` so a test that mocks `sendEmail` still runs the
 * real reading of whatever result the mock returns.
 */

/**
 * The error that kept Resend from accepting a send, or null when it was
 * accepted.
 *
 * A 409 `invalid_idempotent_request` counts as accepted. It means the key
 * already went out with a different body in the last 24 hours — typically a
 * retry after a timeout whose first request did land, re-rendered from data
 * that has changed since. Resending under that key can never succeed, so
 * calling it a failure would only retry for nothing and then report an email
 * the recipient already has as lost.
 *
 * `concurrent_idempotent_requests` is not accepted: the first request is
 * still in flight and may yet fail, so the caller should retry.
 */
export function getSendError(result: {
  error?: ErrorResponse | null;
}): ErrorResponse | null {
  const { error } = result;
  if (!error) return null;

  if (error.name === "invalid_idempotent_request") {
    console.warn(
      "[resend] Idempotency key already used with another body; counting the send as accepted",
    );
    return null;
  }

  return error;
}

// RFC 9110 has senders write IMF-fixdate ("Sun, 06 Nov 1994 08:49:37 GMT").
// Only that form reaches Date.parse, which reads almost anything as a date:
// "soon 5" is May 2001, and "1.5" January 2001.
const IMF_FIXDATE = /^[a-z]{3}, \d{2} [a-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/i;

/**
 * The wait a response's `Retry-After` asks for, in milliseconds, or null
 * when it has none that can be read. A date already past reads as 0.
 *
 * The SDK hands over a rejected send's headers as a plain object with
 * lowercase names; any casing is read here all the same.
 */
export function retryAfterMs(
  headers: Record<string, string> | Headers | null | undefined,
): number | null {
  if (!headers) return null;
  const value =
    headers instanceof Headers
      ? headers.get("retry-after")
      : Object.entries(headers).find(
          ([name]) => name.toLowerCase() === "retry-after",
        )?.[1];
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return Math.ceil(Number(trimmed) * 1000);
  }
  if (!IMF_FIXDATE.test(trimmed)) return null;
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

/** A send Resend rejected, carried as a throw for try/catch and retry paths. */
export class EmailSendError extends Error {
  /** Resend's error name, e.g. `rate_limit_exceeded`. */
  readonly code: ErrorResponse["name"];
  readonly statusCode: number | null;
  /** The response's `Retry-After`, for a caller that schedules its own retry. */
  readonly retryAfterMs: number | null;

  constructor(
    error: ErrorResponse,
    headers?: Record<string, string> | Headers | null,
  ) {
    super(`${error.name}: ${error.message}`);
    this.name = "EmailSendError";
    this.code = error.name;
    this.statusCode = error.statusCode;
    this.retryAfterMs = retryAfterMs(headers);
  }
}

/**
 * What made a send fail, for a log line: a type, never a message, which can
 * carry the request's details. A Resend rejection names its error code.
 */
export function sendFailureType(error: unknown): string {
  if (error instanceof EmailSendError) return `resend:${error.code}`;
  return error instanceof Error ? error.name : typeof error;
}

/** Throws an `EmailSendError` unless Resend accepted the send. */
export function assertSent(result: {
  error?: ErrorResponse | null;
  headers?: Record<string, string> | null;
}): void {
  const error = getSendError(result);
  if (error) throw new EmailSendError(error, result.headers);
}
