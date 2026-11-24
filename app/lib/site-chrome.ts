/**
 * On an element that only the site's layout (`SiteChrome`) renders, in the
 * server's markup, so the code that runs on every page can tell from the
 * first moment whether it is inside that layout, Clerk included: it is not
 * on `/links` or the root 404.
 */
export const SITE_CHROME_ATTRIBUTE = "data-site-chrome";

/**
 * Set on <html> once the site's toasts listen, from an effect after the
 * Toaster (`SiteChromeReady`): the layout's markup arrives before React has
 * hydrated it, and a toast shown meanwhile would go nowhere.
 */
export const SITE_TOASTS_ATTRIBUTE = "data-site-toasts";

/** Sent on `window` each time the site's toasts have mounted. */
export const SITE_CHROME_READY_EVENT = "glitter:site-chrome-ready";

/** Whether this page is inside the site's layout. */
export function inSiteChrome(doc: Document = document): boolean {
  return doc.querySelector(`[${SITE_CHROME_ATTRIBUTE}]`) != null;
}

/** Whether the site's toasts are mounted and listening. */
export function siteToastsReady(doc: Document = document): boolean {
  return doc.querySelector(`[${SITE_TOASTS_ATTRIBUTE}]`) != null;
}
