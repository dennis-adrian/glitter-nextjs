"use client";

import { useEffect } from "react";

import { announceNotificationReceived } from "@/app/components/notifications/notification-events";

/** Message types `public/sw.js` sends; keep the two in step. */
export const SW_NOTIFICATION_RECEIVED = "glitter:notification-received";
export const SW_OPEN = "glitter:open";

/**
 * Whether this page can take the person to a tapped notification itself: the
 * installed app always can (it is the only window there is, and opening
 * another is what fails on an iPhone), and a browser tab can when it is
 * already in the inbox. Any other tab may hold a form half filled, so the
 * worker opens a new window instead.
 */
function canOpenHere() {
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true;
  const path = window.location.pathname;
  return (
    standalone ||
    path === "/my_notifications" ||
    path.startsWith("/my_notifications/")
  );
}

/** A full page load; an object so tests can watch it. */
export const pageLoad = {
  assign(url: string) {
    window.location.assign(url);
  },
};

/** A path on this site, never "//host" or "/\host", which leave it. */
function sitePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || /^\/[/\\]/.test(value)) return null;
  return value;
}

/**
 * Listens to Glitter's service worker for the page: a notification that
 * arrived while the page is open refreshes the inbox and the bell, and a tap
 * on one is answered here when this page can open it, by loading the item's
 * open route (which marks it read and redirects where the inbox would).
 */
export default function ServiceWorkerMessages() {
  useEffect(() => {
    const container = navigator.serviceWorker;
    if (!container) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (data?.type === SW_NOTIFICATION_RECEIVED) {
        announceNotificationReceived();
        return;
      }
      if (data?.type !== SW_OPEN) return;
      const url = sitePath(data.url);
      const accepted = url != null && canOpenHere();
      event.ports[0]?.postMessage({ accepted });
      // A full load, so the open route runs on the server whatever page
      // this is.
      if (accepted) pageLoad.assign(url);
    };

    container.addEventListener("message", onMessage);
    // Messages sent while the page was still loading wait for this.
    container.startMessages?.();
    return () => container.removeEventListener("message", onMessage);
  }, []);

  return null;
}
