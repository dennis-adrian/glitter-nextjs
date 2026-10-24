"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { announceNotificationReceived } from "@/app/components/notifications/notification-events";
import {
  ARRIVALS_PATH,
  LAST_TAP_PATH,
  NOTIFICATION_STATE_CACHE,
  openedNotificationId,
  parseArrivals,
  parseKeptTap,
  sitePath,
  SW_NOTIFICATION_RECEIVED,
  SW_OPEN,
  TAP_FRESH_MS,
} from "@/app/lib/notifications/push/taps";

/** A full page load; an object so tests can watch it. */
export const pageLoad = {
  assign(url: string) {
    window.location.assign(url);
  },
};

/**
 * Taps this page already opened, so the worker's message and the kept copy
 * of the same tap never open it twice.
 */
const openedTaps = new Set<string>();

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

async function readState(path: string): Promise<unknown> {
  try {
    if (typeof caches === "undefined") return null;
    const cache = await caches.open(NOTIFICATION_STATE_CACHE);
    const response = await cache.match(path);
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

async function forgetLastTap() {
  try {
    if (typeof caches === "undefined") return;
    const cache = await caches.open(NOTIFICATION_STATE_CACHE);
    await cache.delete(LAST_TAP_PATH);
  } catch {
    // Expires on its own.
  }
}

function openTap(tapId: string, url: string) {
  if (openedTaps.has(tapId)) return;
  openedTaps.add(tapId);
  void forgetLastTap();
  // A full load, so the open route runs on the server whatever page this
  // is: it marks the item read and redirects where the inbox would.
  pageLoad.assign(url);
}

/**
 * Finishes the last tap when the device opened Glitter without going to it:
 * an iPhone can open a closed app at its start page, or bring a running one
 * forward without telling it. Not when the tap's link already loaded (its
 * route leaves a cookie), when the tap is old, or where this page should not
 * navigate. Says whether it opened one.
 */
async function finishKeptTap(): Promise<boolean> {
  const tap = parseKeptTap(await readState(LAST_TAP_PATH));
  if (!tap) return false;
  if (openedTaps.has(tap.tapId)) return true;
  const alreadyOpened =
    tap.id != null && openedNotificationId(document.cookie) === tap.id;
  if (alreadyOpened || Date.now() - tap.at > TAP_FRESH_MS) {
    await forgetLastTap();
    return false;
  }
  if (!canOpenHere()) return false;
  openTap(tap.tapId, tap.url);
  return true;
}

/**
 * Notifications that arrived while this page was in the background, offered
 * when it comes back: an iPhone may bring the app forward on a tap without
 * saying which notification it was. The inbox shows them itself.
 */
async function offerArrivals(since: number) {
  if (window.location.pathname.startsWith("/my_notifications")) return;
  const arrivals = parseArrivals(await readState(ARRIVALS_PATH)).filter(
    (arrival) => arrival.at > since,
  );
  const [only] = arrivals;
  if (!only) return;
  if (arrivals.length === 1) {
    toast(only.title, {
      description: only.body || undefined,
      action: { label: "Ver", onClick: () => pageLoad.assign(only.url) },
    });
    return;
  }
  toast(`Tenés ${arrivals.length} notificaciones nuevas`, {
    action: {
      label: "Ver",
      onClick: () => pageLoad.assign("/my_notifications"),
    },
  });
}

/**
 * The page's side of Glitter's service worker (public/sw.js). A notification
 * that arrives while the page is open refreshes the inbox and the bell; a
 * tap is opened here when this page can; and when Glitter comes back to the
 * front, a tap the device did not deliver is finished, or what arrived
 * meanwhile is offered.
 */
export default function ServiceWorkerMessages() {
  useEffect(() => {
    const container = navigator.serviceWorker;
    if (!container) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: unknown;
        url?: unknown;
        tapId?: unknown;
      } | null;
      if (data?.type === SW_NOTIFICATION_RECEIVED) {
        announceNotificationReceived();
        return;
      }
      if (data?.type !== SW_OPEN) return;
      const url = sitePath(data.url);
      const tapId = typeof data.tapId === "string" ? data.tapId : null;
      const accepted =
        url != null &&
        tapId != null &&
        (openedTaps.has(tapId) || canOpenHere());
      event.ports[0]?.postMessage({ accepted });
      if (accepted) openTap(tapId, url);
    };

    let hiddenAt =
      document.visibilityState === "hidden"
        ? Date.now()
        : (null as number | null);
    const onReturn = (since: number | null) => {
      void finishKeptTap().then((opened) => {
        if (!opened && since != null) void offerArrivals(since);
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const since = hiddenAt;
      hiddenAt = null;
      onReturn(since);
    };
    // Restored from the back/forward cache: a return, with no hidden time.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) onReturn(null);
    };

    container.addEventListener("message", onMessage);
    // Messages sent while the page was still loading wait for this.
    container.startMessages?.();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    // A cold start may land here instead of on the tap's link.
    onReturn(null);
    return () => {
      container.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return null;
}
