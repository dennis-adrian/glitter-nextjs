"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 60_000;

async function fetchUnreadCount(): Promise<number | null> {
  try {
    const response = await fetch("/api/notifications/unread-count", {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { count?: unknown };
    return typeof body.count === "number" ? body.count : null;
  } catch {
    // A missed poll is retried on the next tick.
    return null;
  }
}

/**
 * The unread count, polled once a minute while the tab is visible, and again
 * on focus and after every navigation. A websocket would buy nothing at this
 * scale; a hidden tab costs nothing.
 */
export function useUnreadNotificationCount() {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);
  const inFlight = useRef(false);

  // Keyed by the path, so a navigation asks again right away.
  useEffect(() => {
    let current = true;

    const poll = () => {
      if (document.visibilityState !== "visible" || inFlight.current) return;
      inFlight.current = true;
      void fetchUnreadCount()
        .then((next) => {
          if (current && next != null) setCount(next);
        })
        .finally(() => {
          inFlight.current = false;
        });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };

    poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [pathname]);

  return { count, setCount };
}
