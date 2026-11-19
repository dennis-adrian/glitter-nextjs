import type { NextRequest } from "next/server";

import { recordLinksPageView } from "@/app/lib/links/queries";
import { toLinksSource } from "@/app/lib/links/statistics";
import {
  callerFingerprint,
  consumeActionRateLimit,
} from "@/app/lib/rate-limit";

/** Views one visitor may count per minute, as many as taps on one link. */
const VIEWS_PER_MINUTE = 5;

/**
 * Counts one showing of `/links`. The page calls it from the browser with
 * `navigator.sendBeacon` once it is on screen (the page itself may come from
 * a cache, so the server never sees it rendered), with `?source=` read from
 * the referrer; anything outside the fixed set counts as `other`.
 *
 * Answers nothing, whatever happens: a failure here must never be something
 * the visitor could notice. Public by design, and limited per visitor like
 * the tap endpoint.
 */
export async function POST(request: NextRequest) {
  try {
    const allowed = await consumeActionRateLimit({
      key: `site-links-view:${callerFingerprint(request.headers)}`,
      limit: VIEWS_PER_MINUTE,
      windowMs: 60_000,
    });
    if (allowed) {
      await recordLinksPageView(
        toLinksSource(request.nextUrl.searchParams.get("source")),
      );
    }
  } catch (error) {
    console.error("links page view", error);
  }
  return new Response(null, { status: 204 });
}
