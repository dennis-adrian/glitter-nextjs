"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/app/lib/utils";

/** Longer delays overflow `setTimeout`, which then fires at once. */
const MAX_TIMEOUT_MS = 2_147_483_647;
/**
 * Everyone waiting refreshes within this window after the opening instant,
 * spread so the crowd does not land on the same millisecond.
 */
export const JITTER_MIN_MS = 1_000;
export const JITTER_MAX_MS = 3_000;

/** Ms until the one refresh, or null when reservations are already open. */
export function refreshDelayMs(
  startsAtMs: number,
  serverNowMs: number,
  random = Math.random(),
): number | null {
  const remaining = startsAtMs - serverNowMs;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  return remaining + JITTER_MIN_MS + random * (JITTER_MAX_MS - JITTER_MIN_MS);
}

/**
 * Re-renders the page's server components once reservations open, so a
 * participant waiting on a "not open yet" screen sees the open state without
 * reloading — the installed app has no reload button.
 *
 * `serverNow` anchors the countdown to the server's clock: a phone whose clock
 * runs ahead refreshes early, gets a new `serverNow` with the page still
 * closed, and schedules again. Once the server says open the parent stops
 * rendering this. iOS suspends timers in a backgrounded app, so the timer is
 * re-checked whenever the page becomes visible.
 */
export default function OpensAtRefresh({
  startsAt,
  serverNow,
  className,
}: {
  startsAt: string;
  serverNow?: string;
  className?: string;
}) {
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const startsAtMs = Date.parse(startsAt);
  const serverNowMs = serverNow ? Date.parse(serverNow) : NaN;

  useEffect(() => {
    const delay = refreshDelayMs(
      startsAtMs,
      Number.isFinite(serverNowMs) ? serverNowMs : Date.now(),
    );
    if (delay == null) return;
    // Fixed once, on the phone's clock.
    const fireAt = Date.now() + delay;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      routerRef.current.refresh();
    };
    // Re-arms (never fires early) until `fireAt` has really passed.
    const arm = () => {
      clearTimeout(timer);
      const remaining = fireAt - Date.now();
      if (remaining <= 0) {
        refresh();
        return;
      }
      timer = setTimeout(arm, Math.min(remaining, MAX_TIMEOUT_MS));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      done = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [startsAtMs, serverNowMs]);

  return (
    <p className={cn("hidden standalone:block", className)}>
      En la app también podés deslizar hacia abajo para actualizar.
    </p>
  );
}
