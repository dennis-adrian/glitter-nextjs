import { createHash } from "crypto";
import {
  type CreateBatchOptions,
  type CreateBatchRequestOptions,
  type CreateBatchResponse,
  type CreateEmailOptions,
  type CreateEmailRequestOptions,
  type CreateEmailResponse,
  type ErrorResponse,
  Resend,
} from "resend";
import { serverEnv } from "../../env";
import { retryAfterMs } from "./resend-result";

export const resend = new Resend(serverEnv.RESEND_API_KEY);

const RESEND_REQUEST_TIMEOUT_MS = 10_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;
/** The longest a throttled send waits before its one retry. */
const MAX_THROTTLE_WAIT_MS = 2_000;
/** The wait when a 429 carries no Retry-After that can be read. */
const DEFAULT_THROTTLE_WAIT_MS = 1_000;

/** Resend refuses a batch request carrying more emails than this. */
export const RESEND_BATCH_MAX_EMAILS = 100;

/**
 * The SDK's own request options: it sends `idempotencyKey` as the
 * `Idempotency-Key` header and merges `headers` over its defaults.
 */
export type SendEmailOptions = CreateEmailRequestOptions;

/** The SDK's response, or the empty one the development no-op returns. */
export type SendEmailResult =
  | CreateEmailResponse
  | { data: null; error: null; headers: null };

/**
 * Resend keeps idempotency keys per account for 24 hours, and a preview
 * deployment can send through the same account as production while numbering
 * purchases and jobs in its own database. Unscoped, a preview send could
 * deduplicate a production one, or 409 it into being counted as sent.
 *
 * A key past Resend's 256-character limit is hashed rather than rejected.
 */
function scopeIdempotencyKey(key: string): string {
  const scoped = `${serverEnv.VERCEL_ENV}:${key}`;
  if (scoped.length <= MAX_IDEMPOTENCY_KEY_LENGTH) return scoped;

  const digest = createHash("sha256").update(key).digest("hex");
  return `${serverEnv.VERCEL_ENV}:sha256:${digest}`;
}

/**
 * Runs one request under the ten-second timeout. The SDK has no timeout of
 * its own, only a signal it hands to fetch. A caller's signal still cancels
 * the request instead of being replaced.
 */
async function withRequestTimeout<T>(
  callerSignal: AbortSignal | undefined,
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("Resend request timed out"));
  }, RESEND_REQUEST_TIMEOUT_MS);
  const signal = callerSignal
    ? AbortSignal.any([controller.signal, callerSignal])
    : controller.signal;

  try {
    const response = await request(signal);

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

/** A setTimeout, so fake timers drive it; a caller's abort ends it early. */
function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);

    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Sends once more after a `rate_limit_exceeded` (429), waiting what Resend's
 * Retry-After asks for up to two seconds, and returns that second result as
 * it is. A 429 means Resend accepted nothing, so the same payload under the
 * same key cannot deliver twice.
 *
 * Only that error is retried, and only once: a timeout may have landed, and
 * every other refusal is the caller's to read. The cap keeps the worst case
 * near 0.5 + 2 + 10 seconds, inside the budgets of callers that send inline.
 */
async function retryThrottledOnce<
  T extends {
    error: ErrorResponse | null;
    headers: Record<string, string> | null;
  },
>(send: () => Promise<T>, callerSignal: AbortSignal | undefined): Promise<T> {
  const first = await send();
  if (first.error?.name !== "rate_limit_exceeded") return first;

  const waitMs = Math.min(
    MAX_THROTTLE_WAIT_MS,
    retryAfterMs(first.headers) ?? DEFAULT_THROTTLE_WAIT_MS,
  );
  // The wait only: never the addresses or the message.
  console.warn("[resend] throttled, retrying once", { waitMs });
  await wait(waitMs, callerSignal);
  return send();
}

/** One email, with the ten-second timeout and one retry of a 429. */
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

  const requestOptions = {
    ...options,
    ...(options.idempotencyKey
      ? { idempotencyKey: scopeIdempotencyKey(options.idempotencyKey) }
      : {}),
  };

  return retryThrottledOnce(
    () =>
      withRequestTimeout(options.signal, (signal) =>
        resend.emails.send(payload, { ...requestOptions, signal }),
      ),
    options.signal,
  );
}

export type SendBatchOptions = {
  /** Scoped like a single send's. */
  idempotencyKey?: string;
  /**
   * `strict`, the SDK's default, fails the whole batch over one invalid
   * email. `permissive` sends the rest and lists the refused indexes in
   * `errors`.
   */
  batchValidation?: "strict" | "permissive";
};

/**
 * The SDK's response, typed by the options' mode: `errors` exists only for
 * a permissive batch. Or the development no-op's, marked `simulated`.
 */
export type SendBatchResult<
  Options extends SendBatchOptions = SendBatchOptions,
> =
  | CreateBatchResponse<Options>
  | (CreateBatchResponse<Options> & { simulated: true });

/**
 * Up to `RESEND_BATCH_MAX_EMAILS` separate emails in one API call, so a
 * mailing to thousands of people costs a few dozen requests instead of
 * thousands. Strict by default: one invalid address fails all of it.
 *
 * Like `sendEmail`, it has a ten-second timeout that rejects, retries one
 * 429, and takes an optional idempotency key, which Resend honours for 24
 * hours so a retried batch is not delivered twice. Also like it, only local
 * development skips Resend: staging (preview) deployments send real mail.
 */
export async function sendBatchEmails<
  Options extends SendBatchOptions = SendBatchOptions,
>(
  payload: CreateBatchOptions,
  options?: Options,
): Promise<SendBatchResult<Options>> {
  if (payload.length > RESEND_BATCH_MAX_EMAILS) {
    throw new Error(
      `Resend batches hold at most ${RESEND_BATCH_MAX_EMAILS} emails; got ${payload.length}`,
    );
  }

  if (serverEnv.VERCEL_ENV === "development") {
    // Counts only: a batch is a slice of a real mailing list, and dev logs
    // are no place for it.
    console.log(
      `[${serverEnv.VERCEL_ENV}] Not sending a batch of ${payload.length} emails. First subject:`,
      payload[0]?.subject,
    );

    const data = {
      data: payload.map(() => ({ id: "not-sent" })),
      // A permissive caller reads the refused indexes; there are none.
      ...(options?.batchValidation === "permissive" ? { errors: [] } : {}),
    };
    // The mode decides the response type, which TypeScript cannot follow
    // from the runtime check above.
    return {
      data,
      error: null,
      headers: null,
      simulated: true,
    } as unknown as CreateBatchResponse<Options> & { simulated: true };
  }

  // The SDK maps replyTo and the rest to the API's names, sends the key as
  // the Idempotency-Key header and the mode as x-batch-validation.
  const requestOptions: CreateBatchRequestOptions = {
    ...(options?.idempotencyKey
      ? { idempotencyKey: scopeIdempotencyKey(options.idempotencyKey) }
      : {}),
    ...(options?.batchValidation
      ? { batchValidation: options.batchValidation }
      : {}),
  };

  // As in sendEmail: a timeout rejects, so the caller treats the outcome as
  // unknown and retries with the same key.
  return retryThrottledOnce(
    () =>
      withRequestTimeout(
        undefined,
        (signal) =>
          resend.batch.send(payload, {
            ...requestOptions,
            signal,
          }) as Promise<CreateBatchResponse<Options>>,
      ),
    undefined,
  );
}

export type ResendSuppressionRemoval =
  /** Resend took the address off its suppression list. */
  | { outcome: "removed" }
  /** Resend had no suppression for it: nothing to do there. */
  | { outcome: "not_listed" }
  /** Resend refused or failed; it may still block the address. */
  | { outcome: "failed"; message: string }
  /** Local development: Resend was left alone. */
  | { outcome: "skipped" };

/**
 * Takes `address` off Resend's own suppression list, so mail to it is
 * delivered again. Without this, an address unblocked only on our side is
 * blocked again by Resend, and so by us, on the next mailing.
 *
 * Skipped only in local development, like the sends. Resend's suppression
 * list is account-wide, so unblocking from staging also unblocks the address
 * for production when both use the same Resend account. A plain request, with
 * the same ten-second limit as the rest.
 */
export async function removeResendSuppression(
  address: string,
): Promise<ResendSuppressionRemoval> {
  if (serverEnv.VERCEL_ENV === "development") return { outcome: "skipped" };

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
