/**
 * On an element that only the site's layout (`SiteChrome`) renders, so the
 * code that runs on every page can tell whether Clerk and the toasts are
 * mounted: they are not on `/links` or the root 404.
 */
export const SITE_CHROME_ATTRIBUTE = "data-site-chrome";

/** Whether this page is inside the site's layout. */
export function inSiteChrome(doc: Document = document): boolean {
  return doc.querySelector(`[${SITE_CHROME_ATTRIBUTE}]`) != null;
}
