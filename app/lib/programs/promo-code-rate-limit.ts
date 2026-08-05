import "server-only";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { consumeActionRateLimit } from "@/app/lib/rate-limit";

const PROMO_PREVIEW_LIMIT = 15;
const PROMO_PREVIEW_WINDOW_MS = 60_000;

async function promoPreviewRateLimitKey(userId: number | null) {
  if (userId !== null) return `program-promo-preview:user:${userId}`;

  const requestHeaders = await headers();
  const forwardedIp = requestHeaders.get("x-forwarded-for")?.split(",")[0];
  const clientIdentifier =
    requestHeaders.get("cf-connecting-ip")?.trim() ||
    requestHeaders.get("x-real-ip")?.trim() ||
    forwardedIp?.trim() ||
    `unknown:${requestHeaders.get("user-agent") ?? "no-user-agent"}`;
  const digest = createHash("sha256").update(clientIdentifier).digest("hex");
  return `program-promo-preview:ip:${digest}`;
}

/**
 * Shared promo-code attempt limiter for preview and checkout. Returns false when
 * the caller is over the limit or the limiter itself fails closed.
 */
export async function consumeProgramPromoPreviewRateLimit(
  userId: number | null,
): Promise<boolean> {
  try {
    return await consumeActionRateLimit({
      key: await promoPreviewRateLimitKey(userId),
      limit: PROMO_PREVIEW_LIMIT,
      windowMs: PROMO_PREVIEW_WINDOW_MS,
    });
  } catch {
    return false;
  }
}
