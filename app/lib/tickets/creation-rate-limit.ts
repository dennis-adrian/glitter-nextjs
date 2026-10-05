import "server-only";

import { headers } from "next/headers";

import {
  callerRateLimitKey,
  consumeActionRateLimit,
  emailFingerprint,
} from "@/app/lib/rate-limit";

/**
 * Generous on purpose: door registration runs on the venue's wifi, where every
 * visitor shares one address. Customer-facing, so changing these limits is a
 * product decision.
 */
const CALLER_LIMIT = 60;
const CALLER_WINDOW_MS = 10 * 60_000;
/** Every ticket mails its visitor; this caps what one inbox can be sent. */
const EMAIL_LIMIT = 5;
const EMAIL_WINDOW_MS = 60 * 60_000;

/**
 * Limits ticket creation per caller and per visitor address. Returns false when
 * either is over its limit, or when the limiter itself fails closed.
 */
export async function consumeTicketCreationRateLimit(input: {
  userId: number | null;
  email: string;
}): Promise<boolean> {
  try {
    // The caller first, so one already over its own limit cannot go on to use
    // up the allowance of an address that may belong to someone else.
    const callerAllowed = await consumeActionRateLimit({
      key: `ticket-create:${callerRateLimitKey(input.userId, await headers())}`,
      limit: CALLER_LIMIT,
      windowMs: CALLER_WINDOW_MS,
    });
    if (!callerAllowed) return false;

    return await consumeActionRateLimit({
      key: `ticket-create:email:${emailFingerprint(input.email)}`,
      limit: EMAIL_LIMIT,
      windowMs: EMAIL_WINDOW_MS,
    });
  } catch {
    return false;
  }
}
