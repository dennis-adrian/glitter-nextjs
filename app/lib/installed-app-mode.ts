/**
 * Whether this window is Glitter's installed app, beyond what
 * `(display-mode: standalone)` says.
 *
 * Some Android phones open the installed app full screen, with no browser
 * bar, while its pages still match `(display-mode: browser)`; with only the
 * media query to go on, they got the browser's navigation (the hamburger, no
 * tab bar). So the app's start page marks its own window as well: `/launch`
 * sends it on with `#installed-app`, and `MARK_INSTALLED_APP_SCRIPT` keeps
 * that in the window's sessionStorage and on <html> as `data-installed-app`.
 * sessionStorage belongs to one window, so browser tabs never share it.
 *
 * The mark remembers how the window opened:
 * - `browser`: the display mode said browser in the installed app, as on
 *   those phones. Only the mark tells this window apart, so it holds for the
 *   window's whole life.
 * - `standalone`: the display mode already said standalone. If it later says
 *   browser, the window left the app (a computer's "Open in Chrome" moves the
 *   app's window into a tab, sessionStorage and all), and the mark goes.
 *
 * No imports: the launch route, the root layout and client code share it.
 */

/** The fragment that marks a window as the installed app. */
export const INSTALLED_APP_LAUNCH_HASH = "installed-app";

/** The window's sessionStorage entry: how the installed app opened. */
export const INSTALLED_APP_SESSION_KEY = "glitter:installed-app";

export const INSTALLED_APP_MARK = {
  browser: "browser",
  standalone: "standalone",
} as const;

/**
 * Set on <html> in the installed app. app/globals.css names it in the
 * `standalone` variant, next to the media query.
 */
export const INSTALLED_APP_ATTRIBUTE = "data-installed-app";

export const STANDALONE_QUERY = "(display-mode: standalone)";

const KEY = JSON.stringify(INSTALLED_APP_SESSION_KEY);
const BROWSER = JSON.stringify(INSTALLED_APP_MARK.browser);
const STANDALONE = JSON.stringify(INSTALLED_APP_MARK.standalone);

/**
 * Runs before the page paints (InstalledAppHead renders it at the top of
 * <body>): reads the launch fragment into sessionStorage, takes it off the
 * address, and marks <html>. Every page load of the window does this, so the
 * mark holds across reloads; InstalledAppMark keeps it across navigations.
 * Without storage, the fragment still marks the page it arrived on.
 */
export const MARK_INSTALLED_APP_SCRIPT = `(function(){var s=false;try{s=matchMedia(${JSON.stringify(
  STANDALONE_QUERY,
)}).matches}catch(e){}var l=false;try{if(location.hash===${JSON.stringify(
  `#${INSTALLED_APP_LAUNCH_HASH}`,
)}){l=true;history.replaceState(history.state,"",location.pathname+location.search)}}catch(e){}var m=null;try{if(l){m=s?${STANDALONE}:${BROWSER};sessionStorage.setItem(${KEY},m)}else{m=sessionStorage.getItem(${KEY});if(m===${STANDALONE}&&!s){sessionStorage.removeItem(${KEY});m=null}}}catch(e){if(l)m=${BROWSER}}if(m===${BROWSER}||m===${STANDALONE})document.documentElement.setAttribute(${JSON.stringify(
  INSTALLED_APP_ATTRIBUTE,
)},"")})()`;

type MarkedBrowser = {
  document?: { documentElement?: { hasAttribute(name: string): boolean } };
  sessionStorage?: { getItem(key: string): string | null };
};

/** How the start page marked this window, or null when it did not. */
export function installedAppMark(
  browser: Pick<MarkedBrowser, "sessionStorage">,
): (typeof INSTALLED_APP_MARK)[keyof typeof INSTALLED_APP_MARK] | null {
  try {
    const mark = browser.sessionStorage?.getItem(INSTALLED_APP_SESSION_KEY);
    return mark === INSTALLED_APP_MARK.browser ||
      mark === INSTALLED_APP_MARK.standalone
      ? mark
      : null;
  } catch {
    // Storage that is blocked throws on access.
    return null;
  }
}

/**
 * Whether the start page marked this window as an installed app that reports
 * the browser's display mode. Reads sessionStorage too, for code that runs
 * before the script above has (instrumentation-client.ts). A `standalone`
 * mark adds nothing here: the display mode already says so.
 */
export function isMarkedInstalledApp(browser: MarkedBrowser): boolean {
  if (installedAppMark(browser) === INSTALLED_APP_MARK.browser) return true;
  try {
    return Boolean(
      browser.document?.documentElement?.hasAttribute(INSTALLED_APP_ATTRIBUTE),
    );
  } catch {
    return false;
  }
}
