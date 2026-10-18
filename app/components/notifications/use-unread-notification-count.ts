"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 60_000;

/**
 * The unread count, polled once a minute while the tab is visible, and again
 * on focus and after every navigation. A websocket would buy nothing at this
 * scale; a hidden tab costs nothing.
 */
export function useUnreadNotificationCount() {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    if (
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    ) {
      return;
    }
    inFlight.current = true;
    try {
      const response = await fetch("/api/notifications/unread-count", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const body = (await response.json()) as { count?: unknown };
      if (typeof body.count === "number") setCount(body.count);
    } catch {
      // A missed poll is retried on the next tick.
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  return { count, setCount, refresh };
}
