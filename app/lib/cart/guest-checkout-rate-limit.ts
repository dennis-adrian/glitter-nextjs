import "server-only";

import { headers } from "next/headers";

import {
  callerRateLimitKey,
  consumeActionRateLimit,
  emailFingerprint,
} from "@/app/lib/rate-limit";

/**
 * Each guest order holds stock until its payment is due and mails the guest
 * and every admin. Customer-facing, so changing these limits is a product
 * decision.
 */
const CALLER_LIMIT = 10;
const EMAIL_LIMIT = 5;
const WINDOW_MS = 60 * 60_000;

/**
 * Limits guest orders per caller and per contact address. Returns false when
 * either is over its limit, or when the limiter itself fails closed.
 */
export async function consumeGuestCheckoutRateLimit(input: {
  userId: number | null;
  email: string;
}): Promise<boolean> {
  try {
    // The caller first, so one already over its own limit cannot go on to use
    // up the allowance of an address that may belong to someone else.
    const callerAllowed = await consumeActionRateLimit({
      key: `guest-checkout:${callerRateLimitKey(input.userId, await headers())}`,
      limit: CALLER_LIMIT,
      windowMs: WINDOW_MS,
    });
    if (!callerAllowed) return false;

    return await consumeActionRateLimit({
      key: `guest-checkout:email:${emailFingerprint(input.email)}`,
      limit: EMAIL_LIMIT,
      windowMs: WINDOW_MS,
    });
  } catch {
    return false;
  }
}
