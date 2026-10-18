"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const INTERVAL_MS = 3_000;
/** The request's worker has 100 seconds; after that the cron takes over. */
const MAX_DURATION_MS = 2 * 60_000;

/** Refreshes the gift page while its recipients are still being credited. */
export default function CreditGiftAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > MAX_DURATION_MS) {
        window.clearInterval(timer);
        return;
      }
      if (document.visibilityState === "visible") router.refresh();
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, router]);

  return null;
}
