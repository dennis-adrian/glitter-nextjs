"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import {
  INSTALLED_APP_ATTRIBUTE,
  INSTALLED_APP_MARK,
  INSTALLED_APP_SESSION_KEY,
  installedAppMark,
  STANDALONE_QUERY,
} from "@/app/lib/installed-app-mode";
import {
  INSTALLED_APP_SEEN_PATH,
  NOTIFICATION_STATE_CACHE,
} from "@/app/lib/notifications/push/taps";

function setMarked(marked: boolean) {
  if (marked) {
    document.documentElement.setAttribute(INSTALLED_APP_ATTRIBUTE, "");
  } else {
    document.documentElement.removeAttribute(INSTALLED_APP_ATTRIBUTE);
  }
}

/** Drops a `standalone` mark once the window reports browser mode. */
function dropMarkIfLeftApp() {
  if (window.matchMedia?.(STANDALONE_QUERY).matches) return;
  if (installedAppMark(window) !== INSTALLED_APP_MARK.standalone) return;
  try {
    window.sessionStorage.removeItem(INSTALLED_APP_SESSION_KEY);
  } catch {
    // Blocked storage held no mark to drop.
  }
  setMarked(false);
}

/**
 * Tells the service worker an Android phone runs the installed app in browser
 * mode, so the windows it opens for a tapped notification get the mark too.
 */
async function recordInstalledAppSeen() {
  if (!/Android/.test(navigator.userAgent)) return;
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(NOTIFICATION_STATE_CACHE);
    await cache.put(
      INSTALLED_APP_SEEN_PATH,
      new Response(JSON.stringify({ at: Date.now() }), {
        headers: { "content-type": "application/json" },
      }),
    );
  } catch {
    // Without it, a tapped notification opens unmarked, as before.
  }
}

/**
 * Keeps the installed app's mark (app/lib/installed-app-mode.ts) right after
 * the first paint, which the inline script handles:
 *
 * - puts `data-installed-app` back on <html> after each navigation, in case
 *   React re-created the element and dropped what it did not render;
 * - takes the mark away when the window leaves the app, as when a computer
 *   moves the installed app's window into a browser tab;
 * - records the installed app for the service worker (see
 *   INSTALLED_APP_SEEN_PATH).
 */
export default function InstalledAppMark() {
  const pathname = usePathname();

  useEffect(() => {
    dropMarkIfLeftApp();
    const mark = installedAppMark(window);
    if (mark) setMarked(true);
    if (mark === INSTALLED_APP_MARK.browser) void recordInstalledAppSeen();
  }, [pathname]);

  useEffect(() => {
    const standalone = window.matchMedia?.(STANDALONE_QUERY);
    standalone?.addEventListener?.("change", dropMarkIfLeftApp);
    return () => standalone?.removeEventListener?.("change", dropMarkIfLeftApp);
  }, []);

  return null;
}
