import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { isMailingTopic, type MailingTopic } from "@/app/lib/emails/topics";

/**
 * The token in an unsubscribe link: which person, and which topic of bulk
 * mail they want to stop.
 *
 * It names a visitor, user or campaign contact row (a visitor comunicado's
 * snapshot of one address) rather than carrying the address, so the
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

export type UnsubscribeRecipientKind = "visitor" | "user" | "contact";

export type UnsubscribeRecipient = {
  kind: UnsubscribeRecipientKind;
  id: number;
};

const KIND_CODES = { visitor: "v", user: "u", contact: "c" } as const;
type KindCode = (typeof KIND_CODES)[UnsubscribeRecipientKind];
const KINDS_BY_CODE: Record<KindCode, UnsubscribeRecipientKind> = {
  v: "visitor",
  u: "user",
  c: "contact",
};

export type UnsubscribeSubject = UnsubscribeRecipient & { topic: MailingTopic };

type TokenPayload = {
  /** Topic. */
  t: MailingTopic;
  /** "v" for a visitor, "u" for a user, "c" for a campaign contact. */
  r: KindCode;
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
    r: KIND_CODES[subject.kind],
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
  if (!isMailingTopic(payload.t)) return null;
  if (
    typeof payload.r !== "string" ||
    !Object.prototype.hasOwnProperty.call(KINDS_BY_CODE, payload.r)
  ) {
    return null;
  }
  if (
    typeof payload.i !== "number" ||
    !Number.isInteger(payload.i) ||
    payload.i <= 0
  ) {
    return null;
  }
  return {
    topic: payload.t,
    kind: KINDS_BY_CODE[payload.r as KindCode],
    id: payload.i,
  };
}
