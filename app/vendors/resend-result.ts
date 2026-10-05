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

/** A send Resend rejected, carried as a throw for try/catch and retry paths. */
export class EmailSendError extends Error {
  /** Resend's error name, e.g. `rate_limit_exceeded`. */
  readonly code: ErrorResponse["name"];
  readonly statusCode: number | null;

  constructor(error: ErrorResponse) {
    super(`${error.name}: ${error.message}`);
    this.name = "EmailSendError";
    this.code = error.name;
    this.statusCode = error.statusCode;
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
export function assertSent(result: { error?: ErrorResponse | null }): void {
  const error = getSendError(result);
  if (error) throw new EmailSendError(error);
}
