"use client";

import { useEffect, useState } from "react";

/**
 * Whole seconds left on a hold, rounded up so 0:00 means expired. Anything
 * unparsable counts as expired: there is nothing to count down from.
 */
export function remainingSecondsAt(expiresAtMs: number, nowMs: number) {
  const seconds = Math.ceil((expiresAtMs - nowMs) / 1000);
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

/**
 * The hold countdown on the server's clock, not the phone's.
 *
 * The first render shows what the server saw at `serverNow`, so SSR and
 * hydration agree (cf. `app/hooks/use-now.ts`). After mount the phone's skew
 * is measured once — `serverNow - Date.now()` — and every tick reads the
 * phone's clock shifted by it, so a phone minutes fast or slow still counts
 * down the real hold. It rechecks when the tab becomes visible or focused,
 * since timers stall in the background.
 *
 * This only displays time: expiry belongs to the server, which refuses a
 * confirm on an expired hold and drops it from every reader.
 */
export function useHoldCountdown(expiresAt: string, serverNow: string) {
  const expiresAtMs = Date.parse(expiresAt);
  const serverNowMs = Date.parse(serverNow);
  const [remaining, setRemaining] = useState(() =>
    remainingSecondsAt(expiresAtMs, serverNowMs),
  );

  useEffect(() => {
    const offsetMs = Number.isFinite(serverNowMs)
      ? serverNowMs - Date.now()
      : 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    const update = () => {
      const next = remainingSecondsAt(expiresAtMs, Date.now() + offsetMs);
      setRemaining(next);
      if (next === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };

    const catchUp = setTimeout(update, 0);
    timer = setInterval(update, 1000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearTimeout(catchUp);
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [expiresAtMs, serverNowMs]);

  return remaining;
}
