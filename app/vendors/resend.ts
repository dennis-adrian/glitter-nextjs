import { CreateEmailOptions, CreateEmailRequestOptions, Resend } from "resend";
import { serverEnv } from "../../env";

export const resend = new Resend(serverEnv.RESEND_API_KEY);

const RESEND_REQUEST_TIMEOUT_MS = 10_000;

export type SendEmailOptions = CreateEmailRequestOptions & {
  /** Forwarded as the Resend `Idempotency-Key` HTTP header. */
  idempotencyKey?: string;
};

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
    const requestOptions = {
      ...rest,
      signal: controller.signal,
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
    } as CreateEmailRequestOptions;

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
