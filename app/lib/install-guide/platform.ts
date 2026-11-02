import {
  isAppleMobile,
  isStandaloneApp,
} from "@/app/lib/notifications/push/support";

/**
 * Which install steps fit this browser, decided from what it exposes. Pure,
 * so `/instalar` and its tests share it; nothing here touches the network.
 *
 * - `unknown`: the server render and the first client render.
 * - `installed`: already running as the installed app.
 * - `ios-safari`, `ios-browser`: an iPhone or iPad, in Safari or in another
 *   browser (Chrome, Edge, Firefox), which can also add to the home screen
 *   from its share button since iOS 16.4.
 * - `ios-in-app`, `android-in-app`: a social app's own browser (Instagram,
 *   Facebook, TikTok), which cannot install anything: open the page in the
 *   phone's browser first.
 * - `android-chromium`: Chrome, Edge, Opera or Samsung Internet on Android,
 *   which can offer the install prompt (`beforeinstallprompt`).
 * - `android-firefox`: installs from its menu, without a prompt.
 * - `desktop-chromium`: Chrome or Edge on a computer, prompt too.
 * - `desktop-safari`: Safari on a Mac, "Agregar al Dock".
 * - `desktop-firefox`: cannot install, though it can receive notifications.
 * - `other`: anything else; the generic steps.
 */
export type InstallPlatform =
  | "unknown"
  | "installed"
  | "ios-safari"
  | "ios-browser"
  | "ios-in-app"
  | "android-chromium"
  | "android-firefox"
  | "android-in-app"
  | "desktop-chromium"
  | "desktop-safari"
  | "desktop-firefox"
  | "other";

/** The browser this person is in, when the steps differ by it. */
export type InstallBrowser =
  | "safari"
  | "chrome"
  | "edge"
  | "firefox"
  | "samsung"
  | "opera"
  | "other";

export type InstallContext = {
  platform: InstallPlatform;
  browser: InstallBrowser;
};

export const UNKNOWN_INSTALL_CONTEXT: InstallContext = {
  platform: "unknown",
  browser: "other",
};

type BrowserLike = Parameters<typeof isStandaloneApp>[0];

/**
 * Social apps that open links in a browser of their own. Facebook and
 * Messenger say FBAN/FBAV, Instagram its name, TikTok musical_ly or
 * Bytedance.
 */
const IN_APP_BROWSER = /Instagram|FBAN|FBAV|FB_IAB|musical_ly|Bytedance|Line\//;

/** Order matters: Edge, Opera and Samsung all also say Chrome and Safari. */
function detectBrowser(userAgent: string): InstallBrowser {
  if (/Edg(?:A|iOS)?\//.test(userAgent)) return "edge";
  if (/SamsungBrowser\//.test(userAgent)) return "samsung";
  if (/OPR\/|OPT\//.test(userAgent)) return "opera";
  if (/Firefox\/|FxiOS\//.test(userAgent)) return "firefox";
  if (/Chrome\/|CriOS\//.test(userAgent)) return "chrome";
  if (/Safari\//.test(userAgent)) return "safari";
  return "other";
}

export function detectInstallContext(browser: BrowserLike): InstallContext {
  const userAgent = browser.navigator?.userAgent ?? "";
  const name = detectBrowser(userAgent);

  if (isStandaloneApp(browser)) return { platform: "installed", browser: name };

  if (isAppleMobile(browser.navigator)) {
    if (IN_APP_BROWSER.test(userAgent)) {
      return { platform: "ios-in-app", browser: "other" };
    }
    // Every iOS browser is Safari underneath; only the others name themselves.
    return name === "safari" || name === "other"
      ? { platform: "ios-safari", browser: "safari" }
      : { platform: "ios-browser", browser: name };
  }

  if (/Android/.test(userAgent)) {
    // `; wv)` marks an Android WebView, which is what in-app browsers are.
    if (IN_APP_BROWSER.test(userAgent) || /; wv\)/.test(userAgent)) {
      return { platform: "android-in-app", browser: "other" };
    }
    if (name === "firefox")
      return { platform: "android-firefox", browser: name };
    if (name === "safari" || name === "other") {
      return { platform: "other", browser: name };
    }
    return { platform: "android-chromium", browser: name };
  }

  if (/Windows|Macintosh|Mac OS X|CrOS|Linux|X11/.test(userAgent)) {
    if (name === "chrome" || name === "edge" || name === "opera") {
      return { platform: "desktop-chromium", browser: name };
    }
    if (name === "safari") return { platform: "desktop-safari", browser: name };
    if (name === "firefox")
      return { platform: "desktop-firefox", browser: name };
  }

  return { platform: "other", browser: name };
}

/** Low-cardinality, for analytics breakdowns. */
export function installPlatformGroup(
  platform: InstallPlatform,
): "ios" | "android" | "desktop" | "installed" | "other" {
  if (platform === "installed") return "installed";
  if (platform.startsWith("ios-")) return "ios";
  if (platform.startsWith("android-")) return "android";
  if (platform.startsWith("desktop-")) return "desktop";
  return "other";
}
