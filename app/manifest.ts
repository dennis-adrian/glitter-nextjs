import type { MetadataRoute } from "next";

import { INSTALLED_APP_START_URL } from "@/app/components/landing/installed-app";
import { installedAppName } from "@/app/lib/installable-app";
import { ICON_BACKGROUND } from "@/app/lib/theme-colors";

/**
 * What lets browsers offer to install Glitter: a home-screen icon, full
 * screen, no browser bar. The service worker (public/sw.js) only shows
 * pushes; it never caches pages.
 */
export default function manifest(): MetadataRoute.Manifest {
  const name = installedAppName();
  return {
    id: "/",
    name,
    short_name: name,
    description: "Creamos festivales para que los artistas brillen",
    lang: "es",
    // Opens past the marketing landing: a session goes to its portal,
    // anyone else to sign in (app/launch/route.ts). `id` stays "/", so
    // existing installs remain the same app.
    start_url: INSTALLED_APP_START_URL,
    scope: "/",
    display: "standalone",
    // Android's launch screen: the icon on this purple.
    background_color: ICON_BACKGROUND,
    // No theme_color, on purpose. Android paints the installed app's bottom
    // navigation bar with it, fixed when Chrome builds the app (pages cannot
    // change it), and the manifest can hold one colour only: purple, or the
    // navbar's light or dark, clashes with the other theme. Without it Chrome
    // gives the bar its own background, which follows the phone's light or
    // dark setting. The status bar still follows each page's theme-color
    // (the navbar's, app/layout.tsx).
    icons: [
      {
        src: "/icons/glitter-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/glitter-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // The artwork sits inside the circle Android keeps when it crops an
      // icon (80% of its width), on a background that runs to the edges, so
      // the same file serves as the maskable icon.
      {
        src: "/icons/glitter-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
