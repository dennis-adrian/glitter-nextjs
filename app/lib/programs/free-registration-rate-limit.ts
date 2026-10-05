import "server-only";

import { headers } from "next/headers";

import { callerRateLimitKey, consumeActionRateLimit } from "@/app/lib/rate-limit";

/**
 * Generous per address on purpose: door registration runs on the venue's wifi,
 * where every visitor shares one. Customer-facing, so changing these limits is
 * a product decision.
 */
const GUEST_LIMIT = 30;
const ACCOUNT_LIMIT = 10;
const WINDOW_MS = 10 * 60_000;

/**
 * Limits free registrations per account, or per network address for guests.
 * No per-email bucket: one email already holds at most one seat per
 * occurrence. Returns false when the caller is over the limit or the limiter
 * itself fails closed.
 */
export async function consumeFreeRegistrationRateLimit(
  userId: number | null,
): Promise<boolean> {
  try {
    return await consumeActionRateLimit({
      key: `free-registration:${callerRateLimitKey(userId, await headers())}`,
      limit: userId === null ? GUEST_LIMIT : ACCOUNT_LIMIT,
      windowMs: WINDOW_MS,
    });
  } catch {
    return false;
  }
}
