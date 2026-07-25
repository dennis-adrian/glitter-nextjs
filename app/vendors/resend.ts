import { CreateEmailOptions, CreateEmailRequestOptions, Resend } from "resend";
import { serverEnv } from "../../env";

export const resend = new Resend(serverEnv.RESEND_API_KEY);

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
  if (!idempotencyKey) {
    return await resend.emails.send(payload, rest);
  }

  // Resend 4.x accepts request options but does not type `idempotencyKey`.
  // Set the HTTP header directly so retries reuse the same provider key.
  return await resend.emails.send(payload, {
    ...rest,
    headers: {
      Authorization: `Bearer ${serverEnv.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
  } as CreateEmailRequestOptions);
}
