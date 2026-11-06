/**
 * The first time this device opens Glitter as the installed app.
 *
 * No browser reports an install from a home-screen icon: Chromium fires
 * `appinstalled` (counted as `app_installed`), Safari on iPhone fires nothing.
 * What every platform does show is the app opening in standalone mode, so the
 * first such launch on a device is the closest sign of an install there is.
 *
 * Once per device, remembered in localStorage. The installed app on iPhone
 * keeps its own storage, apart from Safari's, so the mark set there is the
 * app's own; on Android and computers Chrome shares the profile's storage,
 * and the mark is set the first time the page loads in the app's window.
 * Removing the app and adding it again counts again only where the browser
 * cleared its storage in between (iPhone does, Chrome does not).
 *
 * Client-only.
 */

import { isStandaloneApp } from "@/app/lib/notifications/push/support";

export const FIRST_STANDALONE_LAUNCH_KEY = "glitter:first-standalone-launch-at";

/**
 * Whether this is the device's first launch as the installed app, and marks
 * it so. `false` in a browser tab, on later launches, and when storage is
 * unavailable (private mode, a full quota): without a mark that holds, every
 * launch would count as the first, so none does.
 */
export function recordFirstStandaloneLaunch(
  browser: Window & { localStorage?: Storage },
  now: () => Date = () => new Date(),
): boolean {
  if (!isStandaloneApp(browser)) return false;
  try {
    const storage = browser.localStorage;
    if (!storage) return false;
    if (storage.getItem(FIRST_STANDALONE_LAUNCH_KEY)) return false;
    storage.setItem(FIRST_STANDALONE_LAUNCH_KEY, now().toISOString());
    return true;
  } catch {
    return false;
  }
}
