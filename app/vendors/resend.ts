import { createHash } from "crypto";
import {
  type CreateBatchOptions,
  type CreateBatchRequestOptions,
  type CreateBatchResponse,
  type CreateEmailOptions,
  type CreateEmailRequestOptions,
  type CreateEmailResponse,
  Resend,
} from "resend";
import { serverEnv } from "../../env";

export const resend = new Resend(serverEnv.RESEND_API_KEY);

const RESEND_REQUEST_TIMEOUT_MS = 10_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

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
    const response = await resend.emails.send(payload, {
      ...options,
      ...(options.idempotencyKey
        ? { idempotencyKey: scopeIdempotencyKey(options.idempotencyKey) }
        : {}),
      signal,
    });

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

/** A batch's options: the idempotency key, scoped like a single send's. */
export type SendBatchOptions = { idempotencyKey?: string };

/**
 * Up to `RESEND_BATCH_MAX_EMAILS` separate emails in one API call, so a
 * mailing to thousands of people costs a few dozen requests instead of
 * thousands. The batch is atomic: one invalid address fails all of it.
 *
 * Like `sendEmail`, it has a ten-second timeout that rejects and takes an
 * optional idempotency key, which Resend honours for 24 hours so a retried
 * batch is not delivered twice. Also like it, only local development skips
 * Resend: staging (preview) deployments send real mail.
 */
/** Strict validation, the SDK's default: the whole batch fails or sends. */
type BatchResponse = CreateBatchResponse<CreateBatchRequestOptions>;

export async function sendBatchEmails(
  payload: CreateBatchOptions,
  options: SendBatchOptions = {},
): Promise<BatchResponse | (BatchResponse & { simulated: true })> {
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

    return {
      data: { data: payload.map(() => ({ id: "not-sent" })) },
      error: null,
      headers: null,
      simulated: true as const,
    } as BatchResponse & { simulated: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("Resend request timed out"));
  }, RESEND_REQUEST_TIMEOUT_MS);

  try {
    // The SDK maps replyTo and the rest to the API's names, and sends the
    // key as the Idempotency-Key header.
    const response = await resend.batch.send(payload, {
      ...(options.idempotencyKey
        ? { idempotencyKey: scopeIdempotencyKey(options.idempotencyKey) }
        : {}),
      signal: controller.signal,
    });

    // As in sendEmail: an aborted request resolves as a network failure.
    // Reject, so the caller treats the outcome as unknown and retries with
    // the same key.
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
