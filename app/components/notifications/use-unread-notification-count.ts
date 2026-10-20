"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { onNotificationsChanged } from "@/app/components/notifications/notification-events";

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
 * on focus, after every navigation, and whenever the inbox announces a
 * change. A websocket would buy nothing at this scale; a hidden tab costs
 * nothing.
 */
export function useUnreadNotificationCount() {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);

  // Keyed by the path, so a navigation asks again right away.
  useEffect(() => {
    let current = true;
    // Per run: a poll still in flight from the previous path must not stop
    // this one from asking.
    let inFlight = false;
    let again = false;

    const poll = () => {
      if (document.visibilityState !== "visible") return;
      if (inFlight) {
        // Asked while answering: ask once more when this answer lands.
        again = true;
        return;
      }
      inFlight = true;
      void fetchUnreadCount()
        .then((next) => {
          if (current && next != null) setCount(next);
        })
        .finally(() => {
          inFlight = false;
          if (current && again) {
            again = false;
            poll();
          }
        });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };

    poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const unsubscribe = onNotificationsChanged(poll);
    return () => {
      current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      unsubscribe();
    };
  }, [pathname]);

  return { count, setCount };
}
