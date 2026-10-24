"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { announceNotificationsChanged } from "@/app/components/notifications/notification-events";
import {
  SENSITIVE_PUSH_BODY,
  SENSITIVE_PUSH_TITLE,
  WRITTEN_TEXT_PUSH_BODY,
} from "@/app/lib/notifications/push/payload";
import {
  isAppleMobile,
  isStandaloneApp,
} from "@/app/lib/notifications/push/support";
import {
  type Arrival,
  ARRIVALS_KEPT,
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

/** Long enough to read: on an iPhone it may be the only way to the item. */
const ARRIVAL_TOAST_MS = 10_000;

/**
 * What this page already did. The taps it opened, so the worker's message
 * and the kept copy of one tap never open it twice; opening one loads
 * another page, so any here means this one is on its way out. And the
 * arrivals it offered, by item, a retried push being one.
 */
type Seen = { taps: Set<string>; arrivals: Set<string> };

/**
 * Glitter added to an iPhone's or iPad's home screen: a single window, where
 * opening another only brings the app forward without going anywhere, and
 * which iOS may bring forward on a tap without saying which notification it
 * was.
 */
function isIPhoneApp() {
  return (
    isAppleMobile(navigator) &&
    isStandaloneApp(window as Parameters<typeof isStandaloneApp>[0])
  );
}

/**
 * Whether this page takes the person to a tapped notification itself: the
 * iPhone app always does, and any window already in the inbox. Anywhere else
 * the page may hold a form half filled, so the worker opens the tap in a new
 * window instead; that includes an app installed on a computer, where a new
 * window works.
 */
function canOpenHere() {
  if (isIPhoneApp()) return true;
  const path = window.location.pathname;
  return path === "/my_notifications" || path.startsWith("/my_notifications/");
}

/** Signing in goes on to the page that sent the person there. */
function isSignInPage() {
  const path = window.location.pathname;
  return ["/sign_in", "/sign_up"].some(
    (page) => path === page || path.startsWith(`${page}/`),
  );
}

async function readState(path: string): Promise<unknown> {
  try {
    if (typeof caches === "undefined") return null;
    // Not through caches.open, which would create the cache on every
    // visitor's browser.
    const response = await caches.match(path, {
      cacheName: NOTIFICATION_STATE_CACHE,
    });
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

async function forgetLastTap() {
  try {
    if (typeof caches === "undefined") return;
    if (!(await caches.has(NOTIFICATION_STATE_CACHE))) return;
    const cache = await caches.open(NOTIFICATION_STATE_CACHE);
    await cache.delete(LAST_TAP_PATH);
  } catch {
    // Expires on its own.
  }
}

function openTap(seen: Seen, tapId: string, url: string) {
  if (seen.taps.has(tapId)) return;
  seen.taps.add(tapId);
  void forgetLastTap();
  // A full load, so the open route runs on the server whatever page this
  // is: it marks the item read and redirects where the inbox would.
  pageLoad.assign(url);
}

/**
 * Finishes the last tap when the device opened Glitter without going to it:
 * an iPhone can open a closed app at its start page, or bring a running one
 * forward without telling it. Not when the tap's link already loaded (the
 * open route leaves a cookie; a link from before it is this very page), when
 * the tap is old, on the sign-in page, or where this page should not
 * navigate. Says whether it opened one.
 */
async function finishKeptTap(seen: Seen): Promise<boolean> {
  const tap = parseKeptTap(await readState(LAST_TAP_PATH));
  if (!tap) return false;
  if (seen.taps.has(tap.tapId)) return true;
  const { pathname, search, hash } = window.location;
  const loaded =
    pathname + search + hash === tap.url ||
    (tap.id != null && openedNotificationId(document.cookie) === tap.id);
  if (loaded || Date.now() - tap.at > TAP_FRESH_MS) {
    await forgetLastTap();
    return false;
  }
  if (isSignInPage() || !canOpenHere()) return false;
  openTap(seen, tap.tapId, tap.url);
  return true;
}

function arrivalKey(arrival: Arrival) {
  return arrival.id != null ? `item:${arrival.id}` : `at:${arrival.at}`;
}

/** The lock screen's words, less what only made sense there. */
function arrivalCopy(arrival: Arrival) {
  // A notice that said nothing there: "Glitter" says nothing inside Glitter.
  if (
    arrival.title === SENSITIVE_PUSH_TITLE &&
    arrival.body === SENSITIVE_PUSH_BODY
  ) {
    return { title: SENSITIVE_PUSH_BODY, description: undefined };
  }
  // "Tocá para ver el detalle." would point at the toast; "Ver" opens it.
  const description =
    arrival.body && arrival.body !== WRITTEN_TEXT_PUSH_BODY
      ? arrival.body
      : undefined;
  return { title: arrival.title, description };
}

/**
 * Offers notifications the person has not seen here: once per item, never
 * the one a tap just opened, and not in the inbox, which lists them itself.
 * `mayBeMore` when older ones may have dropped off the worker's list.
 */
function offerArrivals(seen: Seen, arrivals: Arrival[], mayBeMore = false) {
  if (seen.taps.size > 0) return;
  if (window.location.pathname === "/my_notifications") return;
  const opened = openedNotificationId(document.cookie);
  const fresh: Arrival[] = [];
  for (const arrival of arrivals) {
    const key = arrivalKey(arrival);
    if (seen.arrivals.has(key) || (opened != null && arrival.id === opened)) {
      continue;
    }
    seen.arrivals.add(key);
    fresh.push(arrival);
  }
  const [only] = fresh;
  if (!only) return;
  if (fresh.length === 1 && !mayBeMore) {
    const { title, description } = arrivalCopy(only);
    toast(title, {
      description,
      duration: ARRIVAL_TOAST_MS,
      action: { label: "Ver", onClick: () => pageLoad.assign(only.url) },
    });
    return;
  }
  toast(
    mayBeMore
      ? "Tenés notificaciones nuevas"
      : `Tenés ${fresh.length} notificaciones nuevas`,
    {
      duration: ARRIVAL_TOAST_MS,
      action: {
        label: "Ver",
        onClick: () => pageLoad.assign("/my_notifications"),
      },
    },
  );
}

/**
 * What arrived while the iPhone app was in the background, offered when it
 * comes back: iOS may bring it forward on a tap without saying which
 * notification it was. Elsewhere a tap always says, and the device already
 * showed each one.
 */
async function offerArrivalsSince(seen: Seen, since: number) {
  if (!isIPhoneApp()) return;
  const kept = parseArrivals(await readState(ARRIVALS_PATH));
  const arrived = kept.filter((arrival) => arrival.at > since);
  offerArrivals(
    seen,
    arrived,
    kept.length >= ARRIVALS_KEPT && arrived.length === kept.length,
  );
}

/**
 * The page's side of Glitter's service worker (public/sw.js). A notification
 * that arrives while the page is open refreshes the inbox and the bell (and
 * the iPhone app on screen offers it, as iOS may show nothing then); a tap
 * is opened here when this page can; and when Glitter comes back to the
 * front, a tap the device did not deliver is finished, or what arrived
 * meanwhile is offered.
 */
export default function ServiceWorkerMessages() {
  const seenRef = useRef<Seen | null>(null);

  useEffect(() => {
    const container = navigator.serviceWorker;
    if (!container) return;
    // Kept across StrictMode's second run of this effect, which must not
    // open a tap again.
    const seen = (seenRef.current ??= { taps: new Set(), arrivals: new Set() });

    let hiddenAt =
      document.visibilityState === "hidden"
        ? Date.now()
        : (null as number | null);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: unknown;
        url?: unknown;
        tapId?: unknown;
        arrival?: unknown;
      } | null;
      if (data?.type === SW_NOTIFICATION_RECEIVED) {
        announceNotificationsChanged();
        const [arrival] = parseArrivals([data.arrival]);
        if (
          arrival &&
          hiddenAt == null &&
          document.visibilityState === "visible" &&
          isIPhoneApp()
        ) {
          offerArrivals(seen, [arrival]);
        }
        return;
      }
      if (data?.type !== SW_OPEN) return;
      const url = sitePath(data.url);
      const tapId = typeof data.tapId === "string" ? data.tapId : null;
      const accepted =
        url != null && tapId != null && (seen.taps.has(tapId) || canOpenHere());
      event.ports[0]?.postMessage({ accepted });
      if (accepted) openTap(seen, tapId, url);
    };

    const onReturn = (since: number | null) => {
      void finishKeptTap(seen).then((opened) => {
        if (!opened && since != null) void offerArrivalsSince(seen, since);
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
    // Holds messages only until the page has parsed, which turns delivery on
    // by itself: one sent before this listener exists is lost. A tap is then
    // finished from its kept copy, and the inbox and bell ask on mount.
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
