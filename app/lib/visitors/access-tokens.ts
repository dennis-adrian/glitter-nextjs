import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, expiring tokens that say "this browser may act as visitor N".
 *
 * Visitors have no account: their email is how we recognise them. A token
 * replaces the visitor id and email that used to travel in the URL, so a
 * page can no longer be pointed at somebody else's record by editing a
 * number. Each token names its purpose, so one kind cannot be replayed as
 * another.
 *
 * The MAC key is derived from `CLERK_SECRET_KEY` with a label for this use.
 * That key already lets its holder act as any signed-in user, which is more
 * than a visitor token grants, so no extra secret has to be provisioned.
 */

const TOKEN_CONTEXT = "glitter:visitor-access:v1";

export type VisitorTokenPurpose =
  /** Set when a visitor enters their email; lets them get tickets. */
  | "session"
  /** Mailed to the visitor; opens the history of all their tickets. */
  | "history"
  /** A new visitor's email, held between the email step and the form. */
  | "pending-email";

type TokenPayload = {
  p: VisitorTokenPurpose;
  /** Visitor id, or the email for `pending-email`. */
  s: number | string;
  /** Expiry, epoch milliseconds. */
  x: number;
};

function signingKey(): Buffer {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new Error("CLERK_SECRET_KEY is required to sign visitor tokens");
  }
  return createHmac("sha256", secret).update(TOKEN_CONTEXT).digest();
}

function mac(body: string): Buffer {
  return createHmac("sha256", signingKey()).update(body).digest();
}

export function signVisitorToken(input: {
  purpose: VisitorTokenPurpose;
  subject: number | string;
  ttlMs: number;
  now?: number;
}): string {
  const payload: TokenPayload = {
    p: input.purpose,
    s: input.subject,
    x: (input.now ?? Date.now()) + input.ttlMs,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body).toString("base64url")}`;
}

/**
 * The token's subject when it is genuine, unexpired and for `purpose`;
 * null otherwise. Never throws on malformed input.
 */
export function verifyVisitorToken(
  token: unknown,
  purpose: VisitorTokenPurpose,
  now: number = Date.now(),
): number | string | null {
  if (typeof token !== "string" || token.length > 2048) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;

  const expected = mac(body);
  const presented = Buffer.from(signature, "base64url");
  // timingSafeEqual throws on a length mismatch, and the length is not secret.
  if (presented.length !== expected.length) return null;
  if (!timingSafeEqual(presented, expected)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.p !== purpose || typeof payload.x !== "number") return null;
  if (payload.x <= now) return null;
  if (typeof payload.s !== "number" && typeof payload.s !== "string") {
    return null;
  }
  return payload.s;
}

export function verifyVisitorIdToken(
  token: unknown,
  purpose: Exclude<VisitorTokenPurpose, "pending-email">,
  now?: number,
): number | null {
  const subject = verifyVisitorToken(token, purpose, now);
  return typeof subject === "number" && Number.isInteger(subject) && subject > 0
    ? subject
    : null;
}
