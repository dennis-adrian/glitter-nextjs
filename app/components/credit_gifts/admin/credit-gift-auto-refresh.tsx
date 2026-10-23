"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const FAST_INTERVAL_MS = 3_000;
/** The request's own worker is done by then; the rest waits for the cron. */
const FAST_PHASE_MS = 2 * 60_000;
const SLOW_INTERVAL_MS = 30_000;

/**
 * Refreshes the gift page while its recipients are still being credited:
 * every few seconds while the request's worker runs, then every half minute
 * for as long as the cron is finishing it.
 */
export default function CreditGiftAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    let timer: number | undefined;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
      schedule();
    };
    const schedule = () => {
      const fast = Date.now() - startedAt < FAST_PHASE_MS;
      timer = window.setTimeout(
        tick,
        fast ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS,
      );
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [active, router]);

  return null;
}
