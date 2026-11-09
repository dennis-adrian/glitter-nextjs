/**
 * Pull to refresh for the installed app, which has no browser reload: the
 * gesture's numbers, where it may start, and the signal widgets that fetch
 * their own data listen to.
 */

/** How far the page must be pulled (after resistance) to refresh on release. */
export const PULL_THRESHOLD = 64;
/** The most the page follows the finger. */
export const PULL_MAX = 112;
/** Below this, a drag is not yet a pull (it may still be a tap or a scroll). */
export const PULL_SLOP = 8;

/** Sent when the page refreshes, for widgets that fetch their own data. */
export const APP_REFRESH_EVENT = "glitter:refresh";

/** The finger's travel turned into the page's: it follows less and less. */
export function pullDistance(dy: number): number {
  if (dy <= 0) return 0;
  return Math.min(PULL_MAX, dy * 0.5);
}

/** How full the indicator is, 0 to 1. */
export function pullProgress(distance: number): number {
  return Math.max(0, Math.min(1, distance / PULL_THRESHOLD));
}

export function isReadyToRefresh(distance: number): boolean {
  return distance >= PULL_THRESHOLD;
}

/**
 * Whether a pull may start on this element: not inside a dialog or sheet,
 * not on something that drags (a map, an image viewer) or marks itself out,
 * and not inside a box that can still scroll up on its own.
 */
export function canStartPull(
  target: EventTarget | null,
  doc: Document,
): boolean {
  if (!(target instanceof Element)) return false;
  // Something modal is open (a dialog, a confirmation, a sheet, a menu or a
  // select): the pull belongs to it, or to nothing. A drawer counts while it
  // is on screen at all, sliding away included, and so does a body a drawer
  // has pinned in place at its scroll offset (vaul in a Safari tab).
  if (
    doc.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [aria-modal="true"], [data-radix-popper-content-wrapper], [data-vaul-drawer]',
    ) ||
    doc.body.hasAttribute("data-scroll-locked") ||
    doc.body.style.pointerEvents === "none" ||
    doc.body.style.position === "fixed"
  ) {
    return false;
  }
  const view = doc.defaultView;
  for (
    let node: Element | null = target;
    node && node !== doc.body;
    node = node.parentElement
  ) {
    if (node.hasAttribute("data-no-pull-refresh")) return false;
    // Pinch-zoom viewers (maps, vouchers) keep their drags.
    if (node.classList.contains("react-transform-wrapper")) return false;
    const role = node.getAttribute("role");
    if (role === "dialog" || role === "alertdialog") return false;
    if (!view) continue;
    const style = view.getComputedStyle(node);
    // An element that keeps vertical drags for itself (maps, zoomable art).
    const touch = style.touchAction;
    if (
      touch &&
      touch !== "auto" &&
      touch !== "manipulation" &&
      !touch.includes("pan-y")
    ) {
      return false;
    }
    const scrolls =
      /(auto|scroll)/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight;
    if (scrolls && node.scrollTop > 0) return false;
  }
  return true;
}

/** Runs `callback` whenever the page refreshes; returns the unsubscribe. */
export function onAppRefresh(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(APP_REFRESH_EVENT, callback);
  return () => window.removeEventListener(APP_REFRESH_EVENT, callback);
}
