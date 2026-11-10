import type { NextRequest } from "next/server";

import { recordSiteLinkClick } from "@/app/lib/links/queries";
import {
  callerFingerprint,
  consumeActionRateLimit,
} from "@/app/lib/rate-limit";

/** Taps one visitor may count on one link per minute. */
const CLICKS_PER_MINUTE = 5;

/**
 * Counts a tap on one of the `/links` page's links. The page calls it with
 * `navigator.sendBeacon` as the visitor leaves, so it answers nothing: a
 * failure here must never be something the visitor could notice.
 *
 * Public by design. The per-visitor limit keeps a held-down key or a simple
 * loop from inflating a link's count.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return new Response(null, { status: 204 });
  }

  try {
    const allowed = await consumeActionRateLimit({
      key: `site-link-click:${id}:${callerFingerprint(request.headers)}`,
      limit: CLICKS_PER_MINUTE,
      windowMs: 60_000,
    });
    if (allowed) await recordSiteLinkClick(id);
  } catch (error) {
    console.error("site link click", error);
  }
  return new Response(null, { status: 204 });
}
