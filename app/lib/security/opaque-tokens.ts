import "server-only";

import { createHash, randomBytes } from "crypto";

const ACCESS_TOKEN_BYTES = 32;
const TICKET_CODE_BYTES = 16;

/** 64 hex characters. Issued once; only its digest should be persisted. */
export function generateAccessToken(): string {
  return randomBytes(ACCESS_TOKEN_BYTES).toString("hex");
}

/** Compact, unguessable QR payload. */
export function generateTicketCode(): string {
  return randomBytes(TICKET_CODE_BYTES).toString("base64url");
}

/** Client or server idempotency key. */
export function generateIdempotencyKey(): string {
  return randomBytes(16).toString("hex");
}

/** Deterministic digest for matching a presented opaque token. */
export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
