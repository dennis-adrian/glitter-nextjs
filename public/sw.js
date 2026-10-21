/*
 * Glitter's service worker: shows avisos (web push) and opens them when
 * tapped. It has no fetch handler and caches nothing, so it can never serve a
 * stale page; a broken deploy of this file can break avisos, never the site.
 *
 * Served with no-store and a strict CSP (next.config.ts). Keep it plain,
 * dependency-free JavaScript: nothing here is bundled or type-checked.
 */

const FALLBACK_TITLE = "Glitter";
const FALLBACK_BODY = "Tenés una notificación nueva";
const FALLBACK_PATH = "/my_notifications";
const ICON = "/icons/glitter-192.png";
const BADGE = "/icons/glitter-badge-96.png";

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
        title: data.title || FALLBACK_TITLE,
        body: data.body,
        url: sameOriginPath(data.url),
        tag: typeof data.tag === "string" ? data.tag : undefined,
      };
    }
  } catch {
    // Unreadable: still show something, below.
  }
  return { title: FALLBACK_TITLE, body: FALLBACK_BODY, url: FALLBACK_PATH };
}

// Every push must end in a visible notification: browsers revoke the
// permission of a site that receives pushes and shows nothing.
self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: ICON,
      badge: BADGE,
      lang: "es",
      // A retried copy replaces the first instead of stacking.
      tag: payload.tag,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = sameOriginPath(event.notification.data?.url ?? FALLBACK_PATH);
  event.waitUntil(openPath(path));
});

/**
 * Reuses a Glitter tab only when it is already in the inbox: navigating any
 * other would throw away whatever the person was doing there, such as a form
 * half filled. That tab is focused first, while the tap still allows it
 * (Firefox gives it a second, Safari two), and then sent to the item.
 * Otherwise a new window opens; in the installed app it opens in the app.
 */
async function openPath(path) {
  const controlled = await self.clients.matchAll({ type: "window" });
  const inbox = controlled.find((client) => {
    const url = new URL(client.url);
    return (
      url.origin === self.location.origin &&
      url.pathname.startsWith(FALLBACK_PATH)
    );
  });
  if (inbox) {
    let focused = null;
    try {
      focused = await inbox.focus();
    } catch {
      // Not allowed any more: try to take it to the item anyway.
    }
    const tab = focused ?? inbox;
    try {
      if (typeof tab.navigate === "function") {
        await tab.navigate(path);
        return;
      }
    } catch {
      // Not navigable from here.
    }
    // In front already; a second window would be refused in Chromium.
    if (focused) return;
  }
  await self.clients.openWindow(path);
}
