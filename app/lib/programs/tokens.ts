import "server-only";

import { createHash, randomBytes } from "crypto";

/**
 * Opaque identifiers for the programs domain.
 *
 * Access tokens use the same generator already trusted for
 * `orders.guestOrderToken`; ticket codes are shorter only because they are
 * printed into a QR, and are still far beyond guessing.
 *
 * See docs/ARCHITECTURE-paid-programs-and-sessions.md §11.
 */

const ACCESS_TOKEN_BYTES = 32;
const TICKET_CODE_BYTES = 16;

/** 64 hex characters. Issued for every purchase, guest or signed-in. */
export function generateAccessToken(): string {
  return randomBytes(ACCESS_TOKEN_BYTES).toString("hex");
}

/** 22 base64url characters — compact enough for a dense QR. */
export function generateTicketCode(): string {
  return randomBytes(TICKET_CODE_BYTES).toString("base64url");
}

/**
 * Idempotency key for a checkout the client did not supply one for. A retried
 * submit with the same key returns the existing purchase instead of holding a
 * second set of seats.
 */
export function generateIdempotencyKey(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Digest stored in `session_purchases.accessTokenHash`. Hash the token the
 * visitor presented and match on this — the raw token is never persisted, so a
 * database dump or a leaked log yields nothing that opens a purchase.
 *
 * Plain SHA-256 rather than a password hash or an HMAC: the input is 32 bytes
 * of CSPRNG output, so there is nothing to brute-force and no secret to manage.
 * Being deterministic is what lets the lookup stay a single indexed equality.
 *
 * The consequence to keep in mind: the raw token exists only in the response
 * and email at issue time. Re-sending a secure link therefore has to issue a
 * fresh token, which invalidates any link the buyer had saved.
 */
export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
