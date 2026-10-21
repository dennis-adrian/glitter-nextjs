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
 * Navigating needs no user activation, but only works on a window this
 * worker controls (`clients.claim()` makes that every open tab). Focusing and
 * opening a window share the tap's single allowance in Chromium, so a window
 * is focused only once it shows the item, and opened only when none could.
 */
async function openPath(path) {
  const controlled = await self.clients.matchAll({ type: "window" });
  const existing = controlled.find(
    (client) => new URL(client.url).origin === self.location.origin,
  );
  if (existing && typeof existing.navigate === "function") {
    let navigated = null;
    try {
      navigated = await existing.navigate(path);
    } catch {
      // Not navigable after all: open a window below.
    }
    if (navigated) {
      try {
        await navigated.focus();
      } catch {
        // It shows the item either way.
      }
      return;
    }
  }
  await self.clients.openWindow(path);
}
