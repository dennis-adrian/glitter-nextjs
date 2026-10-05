import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { type EmailTopic, isEmailTopic } from "@/app/lib/emails/topics";

/**
 * The token in an unsubscribe link: which person, and which topic of bulk
 * mail they want to stop.
 *
 * It names a visitor or user row rather than carrying the address, so the
 * link puts no email in server logs or analytics. It never expires and is
 * the same every time it is made for the same person and topic: unsubscribe
 * links have to keep working in old emails, and a retried batch must carry
 * the very same body to be deduplicated by its idempotency key.
 *
 * The MAC key is derived from `CLERK_SECRET_KEY` under a label of its own,
 * like the visitor access tokens. Rotating that secret breaks the links in
 * emails already sent; the page then says so and points to support.
 */

const TOKEN_CONTEXT = "glitter:email-unsubscribe:v1";

export type UnsubscribeRecipient = {
  kind: "visitor" | "user";
  id: number;
};

export type UnsubscribeSubject = UnsubscribeRecipient & { topic: EmailTopic };

type TokenPayload = {
  /** Topic. */
  t: EmailTopic;
  /** "v" for a visitor, "u" for a user. */
  r: "v" | "u";
  /** Row id. */
  i: number;
};

function signingKey(): Buffer {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new Error("CLERK_SECRET_KEY is required to sign unsubscribe links");
  }
  return createHmac("sha256", secret).update(TOKEN_CONTEXT).digest();
}

function mac(body: string): Buffer {
  return createHmac("sha256", signingKey()).update(body).digest();
}

export function signUnsubscribeToken(subject: UnsubscribeSubject): string {
  const payload: TokenPayload = {
    t: subject.topic,
    r: subject.kind === "visitor" ? "v" : "u",
    i: subject.id,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body).toString("base64url")}`;
}

/** Who and what the token is for, or null. Never throws. */
export function verifyUnsubscribeToken(
  token: unknown,
): UnsubscribeSubject | null {
  if (typeof token !== "string" || token.length > 512) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;

  const presented = Buffer.from(signature, "base64url");
  const expected = mac(body);
  // timingSafeEqual throws on a length mismatch, and the length is not secret.
  if (presented.length !== expected.length) return null;
  if (!timingSafeEqual(presented, expected)) return null;

  let payload: Partial<TokenPayload>;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isEmailTopic(payload.t)) return null;
  if (payload.r !== "v" && payload.r !== "u") return null;
  if (
    typeof payload.i !== "number" ||
    !Number.isInteger(payload.i) ||
    payload.i <= 0
  ) {
    return null;
  }
  return {
    topic: payload.t,
    kind: payload.r === "v" ? "visitor" : "user",
    id: payload.i,
  };
}
