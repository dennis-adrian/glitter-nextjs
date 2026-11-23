/**
 * Set on <html> while the site's layout (`SiteChrome`) is mounted, so the
 * code that runs on every page can tell whether Clerk and the toasts are
 * there: they are not on `/links` or the root 404. Set from an effect next
 * to the Toaster, once it listens, not by the server's markup: a toast
 * shown while the layout still streams would go nowhere.
 */
export const SITE_CHROME_ATTRIBUTE = "data-site-chrome";

/** Sent on `window` each time the site's layout has mounted its toasts. */
export const SITE_CHROME_READY_EVENT = "glitter:site-chrome-ready";

/** Whether this page is inside the site's layout, with its toasts ready. */
export function inSiteChrome(doc: Document = document): boolean {
  return doc.querySelector(`[${SITE_CHROME_ATTRIBUTE}]`) != null;
}
