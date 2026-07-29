import "server-only";

import { randomBytes } from "crypto";

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
 * Constant-time comparison for a supplied token against the stored one.
 *
 * The database lookup is already an equality match, so this exists for the
 * paths that compare in application code — it keeps them from becoming a timing
 * oracle by accident.
 */
export function tokensMatch(supplied: string, stored: string): boolean {
  if (supplied.length !== stored.length) return false;

  let difference = 0;
  for (let index = 0; index < supplied.length; index++) {
    difference |= supplied.charCodeAt(index) ^ stored.charCodeAt(index);
  }

  return difference === 0;
}
