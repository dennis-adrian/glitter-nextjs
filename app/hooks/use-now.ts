"use client";

import { useEffect, useState } from "react";

/** Often enough that a page left open stops offering a session soon after it ends. */
const DEFAULT_INTERVAL_MS = 30_000;

/**
 * The current time, for render logic that must agree with server HTML.
 *
 * The first render uses `renderedAt`, the instant the server rendered the page,
 * so hydration sees exactly what the server saw. That matters on cached pages:
 * HTML rendered before a session started would otherwise disagree with the
 * browser clock and fail to hydrate. Right after mount it switches to the
 * browser clock and keeps ticking, so the page catches up on its own.
 */
export function useNow(
  renderedAt: Date,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): Date {
  const [now, setNow] = useState(renderedAt);
  const floor = renderedAt.getTime();

  useEffect(() => {
    // Never earlier than `renderedAt`: the page cannot be open before the
    // server rendered it, so a slow device clock must not reopen a slot.
    const tick = () => setNow(new Date(Math.max(Date.now(), floor)));
    const catchUp = setTimeout(tick, 0);
    const interval = setInterval(tick, intervalMs);

    return () => {
      clearTimeout(catchUp);
      clearInterval(interval);
    };
  }, [floor, intervalMs]);

  return now;
}
