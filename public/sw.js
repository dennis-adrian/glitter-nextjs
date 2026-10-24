/*
 * Glitter's service worker: shows notifications (web push) and opens them
 * when tapped. It has no fetch handler and caches no page, so it can never
 * serve a stale one; a broken deploy of this file can break notifications,
 * never the site.
 *
 * Served with no-store and a strict CSP (next.config.ts). Keep it plain,
 * dependency-free JavaScript: nothing here is bundled or type-checked. The
 * page's side is app/components/notifications/service-worker-messages.tsx;
 * the message types and the cache names below must match it.
 */

const FALLBACK_TITLE = "Glitter";
const FALLBACK_BODY = "Tenés una notificación nueva";
const FALLBACK_PATH = "/my_notifications";
const ICON = "/icons/glitter-192.png";
const BADGE = "/icons/glitter-badge-96.png";

const MESSAGE_OPEN = "glitter:open";
const MESSAGE_RECEIVED = "glitter:notification-received";

/**
 * What the page reads when it loads or comes back to the front: the last tap
 * (an iPhone can open the app at its start page instead of the tap's link)
 * and the last few notifications that arrived (shown in the app when they
 * came while it was in the background). No page is ever cached here.
 */
const STATE_CACHE = "glitter-notification-state";
const LAST_TAP = "/__glitter/last-tap";
const ARRIVALS = "/__glitter/arrivals";
const ARRIVALS_KEPT = 5;

/**
 * How long a window may take to say whether it opens a tap itself. Short:
 * focusing or opening a window afterwards must still fit in the second
 * Firefox allows after a tap.
 */
const ANSWER_MS = 400;

// No fetch handler, so a new version can take over at once: an update reaches
// every open tab and the installed app on the next visit.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** A same-origin path, or the inbox when the payload names anything else. */
function sameOriginPath(value) {
  if (!value) return FALLBACK_PATH;
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return FALLBACK_PATH;
    // "/.//host" passes the origin check but its path reads as "//host",
    // which a browser resolves to another site.
    if (url.pathname.startsWith("//")) return FALLBACK_PATH;
    return url.pathname + url.search + url.hash;
  } catch {
    return FALLBACK_PATH;
  }
}

function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (
      data &&
      data.v === 1 &&
      typeof data.title === "string" &&
      typeof data.body === "string" &&
      typeof data.url === "string"
    ) {
      return {
        id: Number.isSafeInteger(data.id) && data.id > 0 ? data.id : null,
        title: data.title || FALLBACK_TITLE,
        body: data.body,
        url: sameOriginPath(data.url),
        tag: typeof data.tag === "string" ? data.tag : undefined,
      };
    }
  } catch {
    // Unreadable: still show something, below.
  }
  return {
    id: null,
    title: FALLBACK_TITLE,
    body: FALLBACK_BODY,
    url: FALLBACK_PATH,
  };
}

/** Glitter's windows, the installed app included, most recently focused first. */
async function glitterWindows() {
  const windows = await self.clients.matchAll({
    type: "window",
    // A page loaded before this worker took over is not controlled by it,
    // but can still be told and asked.
    includeUncontrolled: true,
  });
  return windows.filter((client) => {
    try {
      return new URL(client.url).origin === self.location.origin;
    } catch {
      return false;
    }
  });
}

async function writeState(path, value) {
  if (typeof caches === "undefined") return;
  const cache = await caches.open(STATE_CACHE);
  await cache.put(
    path,
    new Response(JSON.stringify(value), {
      headers: { "content-type": "application/json" },
    }),
  );
}

async function readState(path, fallback) {
  if (typeof caches === "undefined") return fallback;
  const cache = await caches.open(STATE_CACHE);
  const response = await cache.match(path);
  if (!response) return fallback;
  try {
    return await response.json();
  } catch {
    return fallback;
  }
}

/**
 * Keeps the arrival for a page that is in the background now (it offers it
 * when it comes back), and tells open windows, which refresh their inbox and
 * bell.
 */
async function announceArrival(payload) {
  const arrivals = await readState(ARRIVALS, []);
  const kept = Array.isArray(arrivals) ? arrivals : [];
  await writeState(
    ARRIVALS,
    [
      ...kept,
      {
        id: payload.id,
        title: payload.title,
        body: payload.body,
        url: payload.url,
        at: Date.now(),
      },
    ].slice(-ARRIVALS_KEPT),
  );
  for (const client of await glitterWindows()) {
    client.postMessage({ type: MESSAGE_RECEIVED });
  }
}

// Every push must end in a visible notification: browsers revoke the
// permission of a site that receives pushes and shows nothing.
self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: ICON,
        badge: BADGE,
        lang: "es",
        // A retried copy replaces the first instead of stacking.
        tag: payload.tag,
        data: { url: payload.url, id: payload.id },
      }),
      // Extra, so it never stands in the way of the notification.
      announceArrival(payload).catch(() => undefined),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const tap = {
    id: Number.isSafeInteger(data.id) && data.id > 0 ? data.id : null,
    url: sameOriginPath(data.url || FALLBACK_PATH),
    tapId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    at: Date.now(),
  };
  event.waitUntil(openTap(tap));
});

/**
 * Asks a window whether it opens the tap itself: "accepted", "declined" (a
 * browser tab on another page, which may hold a form half filled), or null
 * when it does not answer in time (still loading, or asleep).
 */
function askToOpen(client, tap) {
  return new Promise((resolve) => {
    let channel;
    try {
      channel = new MessageChannel();
    } catch {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, ANSWER_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data && event.data.accepted === true ? "accepted" : "declined");
    };
    try {
      client.postMessage(
        { type: MESSAGE_OPEN, url: tap.url, id: tap.id, tapId: tap.tapId },
        [channel.port2],
      );
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function tryFocus(client) {
  try {
    await client.focus();
    return true;
  } catch {
    return false;
  }
}

/** A full load of the tap's link; `null` back means it redirected, still a success. */
async function tryNavigate(client, url) {
  if (typeof client.navigate !== "function") return false;
  try {
    await client.navigate(url);
    return true;
  } catch {
    return false;
  }
}

async function tryOpenWindow(url) {
  try {
    await self.clients.openWindow(url);
  } catch {
    // Refused: nothing else can open a window now.
  }
}

/**
 * Takes the person to a tapped notification. A window's address cannot tell
 * where it is (it stays the page it first loaded while the app navigates),
 * so the window is asked: the installed app, or a tab already in the inbox,
 * loads the tap's link itself. Only if none answers does the worker focus,
 * navigate or open a window, within what the browser allows after a tap:
 * one of focusing or opening in Chromium, and a second in Firefox.
 *
 * On an iPhone, opening a window only brings a running app forward, and a
 * closed one may open at its start page; the page then finds the tap kept
 * below and finishes it.
 */
async function openTap(tap) {
  const kept = writeState(LAST_TAP, tap).catch(() => undefined);
  const windows = await glitterWindows();
  if (windows.length === 0) {
    await tryOpenWindow(tap.url);
    await kept;
    return;
  }
  const target =
    windows.find((client) => client.focused) ??
    windows.find((client) => client.visibilityState === "visible") ??
    windows[0];
  const answer = await askToOpen(target, tap);
  if (answer === "accepted") {
    await tryFocus(target);
  } else if (answer === "declined") {
    await tryOpenWindow(tap.url);
  } else {
    const focused = await tryFocus(target);
    const navigated = await tryNavigate(target, tap.url);
    // After a focus, Chromium refuses to open a window for the same tap.
    if (!navigated && !focused) await tryOpenWindow(tap.url);
  }
  await kept;
}
