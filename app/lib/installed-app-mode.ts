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
 * No imports: the launch route, the root layout and client code share it.
 */

/** The fragment `/launch` adds to where it sends the installed app. */
export const INSTALLED_APP_LAUNCH_HASH = "installed-app";

/** The window's sessionStorage entry, "1" in the installed app. */
export const INSTALLED_APP_SESSION_KEY = "glitter:installed-app";

/**
 * Set on <html> in the installed app. app/globals.css names it in the
 * `standalone` variant, next to the media query.
 */
export const INSTALLED_APP_ATTRIBUTE = "data-installed-app";

/**
 * Runs before the page paints (InstalledAppHead renders it at the top of
 * <body>): reads the launch fragment into sessionStorage, takes it off the
 * address, and marks <html>. Every page of the window does this, so the mark
 * holds across navigations and reloads.
 */
export const MARK_INSTALLED_APP_SCRIPT = `(function(){var on=false;try{if(location.hash===${JSON.stringify(
  `#${INSTALLED_APP_LAUNCH_HASH}`,
)}){on=true;history.replaceState(history.state,"",location.pathname+location.search)}}catch(e){}try{if(on)sessionStorage.setItem(${JSON.stringify(
  INSTALLED_APP_SESSION_KEY,
)},"1");else on=sessionStorage.getItem(${JSON.stringify(
  INSTALLED_APP_SESSION_KEY,
)})==="1"}catch(e){}if(on)document.documentElement.setAttribute(${JSON.stringify(
  INSTALLED_APP_ATTRIBUTE,
)},"")})()`;

type MarkedBrowser = {
  document?: { documentElement?: { hasAttribute(name: string): boolean } };
  sessionStorage?: { getItem(key: string): string | null };
};

/**
 * Whether the start page marked this window. Reads sessionStorage too, for
 * code that runs before the script above has (instrumentation-client.ts).
 */
export function isMarkedInstalledApp(browser: MarkedBrowser): boolean {
  try {
    if (
      browser.document?.documentElement?.hasAttribute(INSTALLED_APP_ATTRIBUTE)
    ) {
      return true;
    }
    return browser.sessionStorage?.getItem(INSTALLED_APP_SESSION_KEY) === "1";
  } catch {
    // Storage that is blocked throws on access.
    return false;
  }
}
