import {
  CreateBatchOptions,
  CreateBatchRequestOptions,
  CreateEmailOptions,
  CreateEmailRequestOptions,
  Resend,
} from "resend";
import { serverEnv } from "../../env";

export const resend = new Resend(serverEnv.RESEND_API_KEY);

const RESEND_REQUEST_TIMEOUT_MS = 10_000;

/** Resend refuses a batch request carrying more emails than this. */
export const RESEND_BATCH_MAX_EMAILS = 100;

export type SendEmailOptions = CreateEmailRequestOptions & {
  /** Forwarded as the Resend `Idempotency-Key` HTTP header. */
  idempotencyKey?: string;
};

/**
 * Fetch options for one Resend call: a ten-second abort signal, plus the
 * idempotency header when one is given.
 */
function buildRequestOptions(
  rest: CreateEmailRequestOptions,
  signal: AbortSignal,
  idempotencyKey?: string,
) {
  return {
    ...rest,
    signal,
    ...(idempotencyKey
      ? {
          // Resend 4.x accepts fetch options but does not type them.
          headers: {
            Authorization: `Bearer ${serverEnv.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
        }
      : {}),
  };
}

export async function sendEmail(
  payload: CreateEmailOptions,
  options?: SendEmailOptions,
) {
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
    };
  }

  const { idempotencyKey, ...rest } = options ?? {};
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("Resend request timed out"));
  }, RESEND_REQUEST_TIMEOUT_MS);

  try {
    const requestOptions = buildRequestOptions(
      rest,
      controller.signal,
      idempotencyKey,
    ) as CreateEmailRequestOptions;

    const response = await resend.emails.send(payload, requestOptions);

    // Resend 4.x converts fetch aborts into response errors. Restore timeout
    // rejection so callers' existing try/catch paths continue to handle it.
    if (controller.signal.aborted) {
      throw controller.signal.reason;
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resend 4.x renames camelCase fields to the API's snake_case for a single
 * send (`emails.send`), but `batch.send` posts its payload as given, so the
 * API would drop a `replyTo` it does not know.
 */
function toBatchApiEmail(email: CreateEmailOptions): CreateEmailOptions {
  const { replyTo, ...rest } = email;
  if (replyTo === undefined) return email;
  return { ...rest, reply_to: replyTo } as unknown as CreateEmailOptions;
}

/**
 * Up to `RESEND_BATCH_MAX_EMAILS` separate emails in one API call, so a
 * mailing to thousands of people costs a few dozen requests instead of
 * thousands. The batch is atomic: one invalid address fails all of it.
 *
 * Like `sendEmail`, it has a ten-second timeout that rejects and takes an
 * optional idempotency key, which Resend honours for 24 hours so a retried
 * batch is not delivered twice. Unlike it, it only sends from production: a
 * batch goes to a whole list of real people, and a preview deployment must
 * never mail them.
 */
export async function sendBatchEmails(
  payload: CreateBatchOptions,
  options?: SendEmailOptions,
) {
  if (payload.length > RESEND_BATCH_MAX_EMAILS) {
    throw new Error(
      `Resend batches hold at most ${RESEND_BATCH_MAX_EMAILS} emails; got ${payload.length}`,
    );
  }

  if (serverEnv.VERCEL_ENV !== "production") {
    // Counts only: a batch is a slice of a real mailing list, and preview
    // logs are no place for it.
    console.log(
      `[${serverEnv.VERCEL_ENV}] Not sending a batch of ${payload.length} emails. First subject:`,
      payload[0]?.subject,
    );

    return {
      data: { data: payload.map(() => ({ id: "not-sent" })) },
      error: null,
      simulated: true as const,
    };
  }

  const { idempotencyKey, ...rest } = options ?? {};
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("Resend request timed out"));
  }, RESEND_REQUEST_TIMEOUT_MS);

  try {
    const requestOptions = buildRequestOptions(
      rest,
      controller.signal,
      idempotencyKey,
    ) as CreateBatchRequestOptions;

    const response = await resend.batch.send(
      payload.map(toBatchApiEmail),
      requestOptions,
    );

    if (controller.signal.aborted) {
      throw controller.signal.reason;
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export type ResendSuppressionRemoval =
  /** Resend took the address off its suppression list. */
  | { outcome: "removed" }
  /** Resend had no suppression for it: nothing to do there. */
  | { outcome: "not_listed" }
  /** Resend refused or failed; it may still block the address. */
  | { outcome: "failed"; message: string }
  /** Not production: the shared Resend account was left alone. */
  | { outcome: "skipped" };

/**
 * Takes `address` off Resend's own suppression list, so mail to it is
 * delivered again. Without this, an address unblocked only on our side is
 * blocked again by Resend, and so by us, on the next mailing.
 *
 * Production only, like `sendBatchEmails`: previews share the Resend account,
 * and must not change who it delivers to. resend 4.1.1 has no suppressions
 * client, and its generic `delete` takes no abort signal, so this is a plain
 * request with the same ten-second limit as the rest.
 */
export async function removeResendSuppression(
  address: string,
): Promise<ResendSuppressionRemoval> {
  if (serverEnv.VERCEL_ENV !== "production") return { outcome: "skipped" };

  const baseUrl = process.env.RESEND_BASE_URL || "https://api.resend.com";
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("Resend request timed out"));
  }, RESEND_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${baseUrl}/suppressions/${encodeURIComponent(address)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${serverEnv.RESEND_API_KEY}` },
        signal: controller.signal,
      },
    );
    if (response.ok) return { outcome: "removed" };
    if (response.status === 404) return { outcome: "not_listed" };

    let message = `Resend respondió ${response.status}`;
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === "string" && body.message) {
        message = body.message;
      }
    } catch {
      // The status alone is enough to report.
    }
    return { outcome: "failed", message };
  } catch (error) {
    return {
      outcome: "failed",
      message: error instanceof Error ? error.message : "Error desconocido",
    };
  } finally {
    clearTimeout(timeout);
  }
}
