/**
 * What this browser can do about avisos, decided from what the browser
 * exposes. Shared by the control and its tests; nothing here touches the
 * network or the server.
 *
 * - `unknown`: the server render and the first client render, before the
 *   browser can be asked.
 * - `unsupported`: no service worker or Push API.
 * - `ios-outdated`: an iPhone or iPad before iOS 16.4, which has no web push.
 * - `ios-in-app-browser`: Instagram's or Facebook's browser on an iPhone,
 *   which cannot add anything to the home screen.
 * - `ios-needs-install`: an iPhone or iPad outside the home-screen app. iOS
 *   only delivers web push to Glitter added to the home screen (16.4+), and in
 *   a Safari tab the Push API is simply missing, so this is told apart by
 *   platform rather than by feature checks.
 * - `denied`, `default`, `granted`: the notification permission.
 */
export type PushSupport =
  | "unknown"
  | "unsupported"
  | "ios-outdated"
  | "ios-in-app-browser"
  | "ios-needs-install"
  | "denied"
  | "default"
  | "granted";

type BrowserLike = {
  navigator?: {
    userAgent?: string;
    maxTouchPoints?: number;
    standalone?: boolean;
    serviceWorker?: unknown;
  };
  matchMedia?: (query: string) => { matches: boolean };
  PushManager?: unknown;
  Notification?: { permission?: string };
};

export function isAppleMobile(navigator: BrowserLike["navigator"]): boolean {
  const userAgent = navigator?.userAgent ?? "";
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  // iPadOS 13 and later reports a Mac; only the touch screen gives it away.
  return /Macintosh/.test(userAgent) && (navigator?.maxTouchPoints ?? 0) > 1;
}

export function isStandaloneApp(browser: BrowserLike): boolean {
  if (browser.navigator?.standalone === true) return true;
  try {
    return browser.matchMedia?.("(display-mode: standalone)").matches ?? false;
  } catch {
    return false;
  }
}

/** iOS's version from the user agent ("OS 16_4"), or null when it says none. */
function iosVersion(userAgent: string): [number, number] | null {
  const match = /OS (\d+)_(\d+)/.exec(userAgent);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

export function detectPushSupport(browser: BrowserLike): PushSupport {
  if (isAppleMobile(browser.navigator)) {
    const userAgent = browser.navigator?.userAgent ?? "";
    const version = iosVersion(userAgent);
    if (version && (version[0] < 16 || (version[0] === 16 && version[1] < 4))) {
      return "ios-outdated";
    }
    if (!isStandaloneApp(browser)) {
      return /Instagram|FBAN|FBAV/.test(userAgent)
        ? "ios-in-app-browser"
        : "ios-needs-install";
    }
  }
  if (
    !browser.navigator?.serviceWorker ||
    !browser.PushManager ||
    !browser.Notification
  ) {
    return "unsupported";
  }
  const permission = browser.Notification.permission;
  if (permission === "granted" || permission === "denied") return permission;
  return "default";
}

/** The VAPID public key as `pushManager.subscribe` wants it. */
export function urlBase64ToUint8Array(
  base64Url: string,
): Uint8Array<ArrayBuffer> {
  const padded = `${base64Url}${"=".repeat((4 - (base64Url.length % 4)) % 4)}`;
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

/** Whether a subscription was made with this key; a rotated key orphans it. */
export function subscribedWithKey(
  applicationServerKey: ArrayBuffer | null | undefined,
  publicKey: string,
): boolean {
  if (!applicationServerKey) return false;
  const current = urlBase64ToUint8Array(publicKey);
  const saved = new Uint8Array(applicationServerKey);
  return (
    saved.length === current.length &&
    saved.every((byte, index) => byte === current[index])
  );
}

const BROWSERS: [RegExp, string][] = [
  [/Edg(?:A|iOS)?\//, "Edge"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/OPR\//, "Opera"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Windows/, "Windows"],
  [/Macintosh|Mac OS X/, "Mac"],
  [/Linux/, "Linux"],
];

/**
 * A name the person will recognise in their device list: "iPhone", "Chrome en
 * Android", "Firefox en Windows". On an iPhone or iPad avisos only ever come
 * through the home-screen app, so the browser is left out.
 */
export function pushDeviceLabel(navigator: BrowserLike["navigator"]): string {
  const userAgent = navigator?.userAgent ?? "";
  if (isAppleMobile(navigator)) {
    return /iPhone|iPod/.test(userAgent) ? "iPhone" : "iPad";
  }
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && system) return `${browser} en ${system}`;
  return browser ?? system ?? "Navegador";
}
