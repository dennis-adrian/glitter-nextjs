/**
 * What the service worker (public/sw.js), the open route and the page share
 * about tapped notifications. No imports: the route, a client component and
 * the tests all read it. sw.js keeps its own copies of these names (it is not
 * bundled); a test checks they match.
 */

/** Messages from the worker to a page. */
export const SW_OPEN = "glitter:open";
export const SW_NOTIFICATION_RECEIVED = "glitter:notification-received";

/** Where the worker keeps the last tap and recent arrivals for the page. */
export const NOTIFICATION_STATE_CACHE = "glitter-notification-state";
export const LAST_TAP_PATH = "/__glitter/last-tap";
export const ARRIVALS_PATH = "/__glitter/arrivals";

/**
 * Set by the open route for a couple of minutes: the page then knows that
 * tap's link already loaded and does not open it again.
 */
export const OPENED_NOTIFICATION_COOKIE = "glitter_opened_notification";

/** How long a kept tap is still worth finishing. */
export const TAP_FRESH_MS = 2 * 60 * 1000;

export type KeptTap = {
  id: number | null;
  url: string;
  tapId: string;
  at: number;
};

export type Arrival = {
  id: number | null;
  title: string;
  body: string;
  url: string;
  at: number;
};

/** A path on this site, never "//host" or "/\host", which leave it. */
export function sitePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || /^\/[/\\]/.test(value)) return null;
  return value;
}

function notificationId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

export function parseKeptTap(value: unknown): KeptTap | null {
  if (!value || typeof value !== "object") return null;
  const tap = value as Record<string, unknown>;
  const url = sitePath(tap.url);
  if (!url || typeof tap.tapId !== "string" || typeof tap.at !== "number") {
    return null;
  }
  return { id: notificationId(tap.id), url, tapId: tap.tapId, at: tap.at };
}

export function parseArrivals(value: unknown): Arrival[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): Arrival[] => {
    if (!entry || typeof entry !== "object") return [];
    const arrival = entry as Record<string, unknown>;
    const url = sitePath(arrival.url);
    if (
      !url ||
      typeof arrival.title !== "string" ||
      typeof arrival.at !== "number"
    ) {
      return [];
    }
    return [
      {
        id: notificationId(arrival.id),
        title: arrival.title,
        body: typeof arrival.body === "string" ? arrival.body : "",
        url,
        at: arrival.at,
      },
    ];
  });
}

/** The notification whose open route ran last, from `document.cookie`. */
export function openedNotificationId(cookies: string): number | null {
  for (const part of cookies.split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === OPENED_NOTIFICATION_COOKIE) {
      return notificationId(Number(value));
    }
  }
  return null;
}
