import { classifyReferrer, type LinksSource } from "@/app/lib/links/statistics";

/*
 * Counting `/links` from the browser: the page may be served from a cache,
 * so the server never sees it shown. Every call here is a beacon that
 * nothing waits for, and every failure is swallowed: counting must never be
 * something a visitor notices.
 */

/**
 * Where this visit came from. Read once per page load: `document.referrer`
 * keeps naming the page that opened this document, whatever the app does
 * after.
 */
let source: LinksSource | null = null;
export function visitSource(): LinksSource {
  if (source == null) {
    try {
      source = classifyReferrer(document.referrer, location.hostname);
    } catch {
      source = "other";
    }
  }
  return source;
}

/** Posts `path` with the visit's source, without waiting or failing. */
export function sendLinksBeacon(path: string) {
  try {
    navigator.sendBeacon(`${path}?source=${encodeURIComponent(visitSource())}`);
  } catch {
    // Counting is best-effort.
  }
}

let viewCounted = false;

/**
 * Counts this page load as one view of `/links`, once however often it is
 * asked. A page prerendered ahead of a tap (speculation rules) counts only
 * when it is actually shown.
 */
export function countLinksView() {
  if (viewCounted) return;
  viewCounted = true;
  const send = () => sendLinksBeacon("/api/links/view");
  try {
    if ((document as Document & { prerendering?: boolean }).prerendering) {
      document.addEventListener("prerenderingchange", send, { once: true });
      return;
    }
  } catch {
    // Not knowing is the same as not prerendering.
  }
  send();
}

/** Lets a test start a fresh page load. */
export function resetLinksCountingForTests() {
  source = null;
  viewCounted = false;
}
