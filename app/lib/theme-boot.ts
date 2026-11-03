import { THEME_COLORS } from "@/app/lib/theme-colors";

/** next-themes' defaults, as the root layout configures it. */
const STORAGE_KEY = "theme";
/** Print documents stay light (see LIGHT_ONLY_PATH_PREFIXES). */
const LIGHT_ONLY_PATH_PREFIXES = ["/couponbook-print"];

/**
 * Puts the theme Glitter shows on <html> while <head> is still being parsed,
 * before anything is painted.
 *
 * next-themes does the same, but from a script in <body>. That is too late
 * for the installed app on iOS: it paints the status bar from the page's
 * background at launch and keeps it, so a phone in light mode with Glitter
 * set to Oscuro got a light bar over a dark app. With the theme already on
 * <html>, the first paint is in the right theme.
 *
 * It also sets `theme-color`, which Android uses for its status bar, as soon
 * as those tags exist, instead of after hydration.
 *
 * A plain inline script, not `next/script`: in the App Router a
 * `beforeInteractive` inline script is queued and run by Next's runtime,
 * after the first paint.
 */
export const THEME_BOOT_SCRIPT = `(function () {
  try {
    var root = document.documentElement;
    var path = location.pathname;
    var lightOnly = ${JSON.stringify(LIGHT_ONLY_PATH_PREFIXES)}.some(function (prefix) {
      return path.indexOf(prefix) === 0;
    });
    var stored = null;
    try { stored = localStorage.getItem(${JSON.stringify(STORAGE_KEY)}); } catch (e) {}
    var theme = lightOnly
      ? "light"
      : stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    root.style.colorScheme = theme;
    var color = theme === "dark" ? ${JSON.stringify(THEME_COLORS.dark)} : ${JSON.stringify(THEME_COLORS.light)};
    var paint = function () {
      var tags = document.querySelectorAll('meta[name="theme-color"]');
      for (var i = 0; i < tags.length; i++) tags[i].setAttribute("content", color);
    };
    paint();
    document.addEventListener("DOMContentLoaded", paint, { once: true });
  } catch (e) {}
})();`;
