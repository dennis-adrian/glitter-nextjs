"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { inSiteChrome, SITE_CHROME_READY_EVENT } from "@/app/lib/site-chrome";

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
  notificationId,
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
/** How long a tap waits for a fresh session before going anyway. */
const SESSION_WAIT_MS = 2_000;

type Router = ReturnType<typeof useRouter>;

/**
 * This page's side of the taps and arrivals. The taps it opened, so the
 * worker's message and the kept copy of one tap never open it twice; the
 * items it offered or opened, so none is offered again (a retried push is
 * one item); and whether it is reloading, after which it offers nothing.
 */
type PageState = {
  router: Router;
  taps: Set<string>;
  arrivals: Set<string>;
  /** Arrivals that came while no toast could show, to offer once one can. */
  unoffered: Arrival[];
  leaving: boolean;
};

/** A notification to go to: `href` where it lands, `url` its open route. */
type Target = { id: number | null; url: string; href: string | null };

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

/**
 * Whether the session can be used as it is. After a while in the background
 * its token has expired, and the proxy sends a request inside the app that
 * carries one to sign in (a full page load renews it on the way instead).
 * Clerk renews it as Glitter comes back; this waits for that, briefly.
 */
async function freshSession(): Promise<boolean> {
  const clerk = (
    window as {
      Clerk?: { session?: { getToken: () => Promise<unknown> } | null };
    }
  ).Clerk;
  // Not loaded yet: the page itself just loaded, with a fresh session.
  const token = clerk?.session?.getToken();
  if (!token) return true;
  return Promise.race([
    token.then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), SESSION_WAIT_MS),
    ),
  ]);
}

/**
 * Goes to `href` inside the app, or with a full load of `fallback`. Always
 * the full load outside the site's layout (`/links`, the root 404): Clerk is
 * not there to renew the session, and the site's header renders on the
 * server that way.
 */
async function go(page: PageState, href: string, fallback: string) {
  if (inSiteChrome() && (await freshSession())) {
    page.router.push(href);
    return true;
  }
  page.leaving = true;
  pageLoad.assign(fallback);
  return false;
}

/**
 * Goes to a notification. Without reloading when the push said where it
 * lands: the screen changes as soon as the server answers, showing its
 * loading state meanwhile. Through its open route with a full load when the
 * push is from before that, or the session could not be renewed in time.
 */
function openItem(page: PageState, target: Target) {
  if (target.id != null) toast.dismiss(`item:${target.id}`);
  if (target.id == null || target.href == null) {
    page.leaving = true;
    pageLoad.assign(target.url);
    return;
  }
  page.arrivals.add(`item:${target.id}`);
  const { url } = target;
  void go(page, target.href, url).then((inPlace) => {
    if (!inPlace) return;
    // Read on the server through its open route, as a full load would be:
    // its path holds across deploys, and the request outlives a reload. It
    // also leaves the cookie that stops this tap being opened again.
    void fetch(url, {
      credentials: "same-origin",
      redirect: "manual",
      keepalive: true,
    })
      .then(() => announceNotificationsChanged())
      .catch(() => undefined);
  });
}

function openTap(page: PageState, tapId: string, target: Target) {
  if (page.taps.has(tapId)) return;
  page.taps.add(tapId);
  void forgetLastTap();
  openItem(page, target);
}

/**
 * Finishes the last tap when the device opened Glitter without going to it:
 * an iPhone can open a closed app at its start page, or bring a running one
 * forward without telling it. Not when the tap's link already loaded (the
 * open route leaves a cookie; a link from before it is this very page), when
 * the tap is old, on the sign-in page, or where this page should not
 * navigate. Says whether it opened one.
 */
async function finishKeptTap(page: PageState): Promise<boolean> {
  const tap = parseKeptTap(await readState(LAST_TAP_PATH));
  if (!tap) return false;
  if (page.taps.has(tap.tapId)) return true;
  const { pathname, search, hash } = window.location;
  const loaded =
    pathname + search + hash === tap.url ||
    (tap.id != null && openedNotificationId(document.cookie) === tap.id);
  if (loaded || Date.now() - tap.at > TAP_FRESH_MS) {
    await forgetLastTap();
    return false;
  }
  if (isSignInPage() || !canOpenHere()) return false;
  openTap(page, tap.tapId, tap);
  return true;
}

/**
 * When the oldest arrival this window could not offer came, kept for the
 * window's life: leaving `/links` for the site is a full load, and the worker
 * posts each arrival once.
 */
const UNOFFERED_SINCE_KEY = "glitter:unoffered-arrivals-since";

function keepUnoffered(page: PageState, arrivals: Arrival[]) {
  if (arrivals.length === 0) return;
  // Also here: the worker keeps an arrival only after posting it.
  page.unoffered.push(...arrivals);
  try {
    const kept = Number(sessionStorage.getItem(UNOFFERED_SINCE_KEY));
    // Just before it: what is offered is what came after `since`.
    const since = Math.min(...arrivals.map((arrival) => arrival.at - 1));
    if (!kept || since < kept) {
      sessionStorage.setItem(UNOFFERED_SINCE_KEY, String(since));
    }
  } catch {
    // Without storage it waits for the next return to the app, as before.
  }
}

/** What `keepUnoffered` kept, now to be offered; forgotten here. */
function takeUnoffered(page: PageState): {
  since: number | null;
  arrivals: Arrival[];
} {
  const arrivals = page.unoffered;
  page.unoffered = [];
  let since: number | null = null;
  try {
    const kept = Number(sessionStorage.getItem(UNOFFERED_SINCE_KEY));
    sessionStorage.removeItem(UNOFFERED_SINCE_KEY);
    if (kept > 0) since = kept;
  } catch {
    // Only what this page kept itself.
  }
  return { since, arrivals };
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
 * one a tap opened, and not in the inbox, which lists them itself.
 * `mayBeMore` when older ones may have dropped off the worker's list.
 */
function offerArrivals(
  page: PageState,
  arrivals: Arrival[],
  mayBeMore = false,
) {
  if (page.leaving) return;
  // No toasts are mounted outside the site's layout (or not yet): keep them
  // for when they are.
  if (!inSiteChrome()) {
    keepUnoffered(page, arrivals);
    return;
  }
  if (window.location.pathname === "/my_notifications") return;
  const opened = openedNotificationId(document.cookie);
  const fresh: Arrival[] = [];
  for (const arrival of arrivals) {
    const key = arrivalKey(arrival);
    if (page.arrivals.has(key) || (opened != null && arrival.id === opened)) {
      continue;
    }
    page.arrivals.add(key);
    fresh.push(arrival);
  }
  const [only] = fresh;
  if (!only) return;
  if (fresh.length === 1 && !mayBeMore) {
    const { title, description } = arrivalCopy(only);
    toast(title, {
      // Dismissed when the item opens.
      id: arrivalKey(only),
      description,
      duration: ARRIVAL_TOAST_MS,
      action: { label: "Ver", onClick: () => openItem(page, only) },
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
        onClick: () => void go(page, "/my_notifications", "/my_notifications"),
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
async function offerArrivalsSince(
  page: PageState,
  since: number | null,
  also: Arrival[] = [],
) {
  if (!isIPhoneApp()) return;
  const kept =
    since == null ? [] : parseArrivals(await readState(ARRIVALS_PATH));
  const arrived = kept.filter((arrival) => since != null && arrival.at > since);
  const keys = new Set(arrived.map(arrivalKey));
  const extra = also.filter((arrival) => !keys.has(arrivalKey(arrival)));
  offerArrivals(
    page,
    [...arrived, ...extra],
    kept.length >= ARRIVALS_KEPT && arrived.length === kept.length,
  );
}

/** What came while no toast could show, with what came since `since`. */
function offerUnoffered(page: PageState, since: number | null) {
  const unoffered = inSiteChrome()
    ? takeUnoffered(page)
    : { since: null, arrivals: [] };
  const from = earliest(since, unoffered.since);
  if (from == null && unoffered.arrivals.length === 0) return;
  void offerArrivalsSince(page, from, unoffered.arrivals);
}

function earliest(a: number | null, b: number | null) {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

/**
 * The browser's service workers, or null where it has none: an in-app
 * browser (Instagram's, on an iPhone) leaves `navigator.serviceWorker` out
 * or undefined. Read from the argument on purpose. The production build
 * takes `navigator.serviceWorker`, written out, to always be there, and
 * drops an `if (!navigator.serviceWorker) return`; every page then crashed
 * in those browsers on the first line that used it.
 */
function workerContainer(browser: {
  serviceWorker?: ServiceWorkerContainer;
}): ServiceWorkerContainer | null {
  if (!("serviceWorker" in browser)) return null;
  return browser.serviceWorker ?? null;
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
  const router = useRouter();
  const stateRef = useRef<PageState | null>(null);

  useEffect(() => {
    const container = workerContainer(navigator);
    if (!container) return;
    // Kept across StrictMode's second run of this effect, which must not
    // open a tap again.
    const page = (stateRef.current ??= {
      router,
      taps: new Set(),
      arrivals: new Set(),
      unoffered: [],
      leaving: false,
    });
    page.router = router;

    let hiddenAt =
      document.visibilityState === "hidden"
        ? Date.now()
        : (null as number | null);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: unknown;
        url?: unknown;
        href?: unknown;
        id?: unknown;
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
          offerArrivals(page, [arrival]);
        }
        return;
      }
      if (data?.type !== SW_OPEN) return;
      const url = sitePath(data.url);
      const tapId = typeof data.tapId === "string" ? data.tapId : null;
      const accepted =
        url != null && tapId != null && (page.taps.has(tapId) || canOpenHere());
      event.ports[0]?.postMessage({ accepted });
      if (accepted) {
        openTap(page, tapId, {
          id: notificationId(data.id),
          url,
          href: sitePath(data.href),
        });
      }
    };

    const onReturn = (since: number | null) => {
      void finishKeptTap(page).then((opened) => {
        if (!opened) offerUnoffered(page, since);
      });
    };
    // The site's toasts just mounted: offer what came while they were not.
    const onSiteChromeReady = () => offerUnoffered(page, null);
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
    window.addEventListener(SITE_CHROME_READY_EVENT, onSiteChromeReady);
    // A cold start may land here instead of on the tap's link.
    onReturn(null);
    return () => {
      container.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener(SITE_CHROME_READY_EVENT, onSiteChromeReady);
    };
  }, [router]);

  return null;
}
