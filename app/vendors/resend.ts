import {
  type CreateEmailOptions,
  type CreateEmailRequestOptions,
  type CreateEmailResponse,
  Resend,
} from "resend";
import { serverEnv } from "../../env";

export const resend = new Resend(serverEnv.RESEND_API_KEY);

const RESEND_REQUEST_TIMEOUT_MS = 10_000;

/**
 * The SDK's own request options: it sends `idempotencyKey` as the
 * `Idempotency-Key` header and merges `headers` over its defaults.
 */
export type SendEmailOptions = CreateEmailRequestOptions;

/** The SDK's response, or the empty one the development no-op returns. */
export type SendEmailResult =
  | CreateEmailResponse
  | { data: null; error: null; headers: null };

export async function sendEmail(
  payload: CreateEmailOptions,
  options: SendEmailOptions = {},
): Promise<SendEmailResult> {
  if (serverEnv.VERCEL_ENV === "development") {
    console.log("Sending email to", payload.to);
    console.log("Subject:", payload.subject);
    console.log("From:", payload.from);
    console.log("To:", payload.to);
    console.log("--------------------------------");
    console.log("--------------------------------");

    return {
      data: null,
      error: null,
      headers: null,
    };
  }

  // The SDK has no timeout of its own, only a signal it hands to fetch.
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("Resend request timed out"));
  }, RESEND_REQUEST_TIMEOUT_MS);
  // A caller's signal still cancels the request instead of being replaced.
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;

  try {
    const response = await resend.emails.send(payload, { ...options, signal });

    // The SDK resolves an aborted request as a network failure instead of
    // rejecting. Reject so callers' try/catch paths still see the timeout.
    // The abort can land after Resend accepted the email but before the SDK
    // read the reply, so a caller that retries on this should send an
    // idempotency key.
    if (signal.aborted) {
      throw signal.reason;
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}
