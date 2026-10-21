import type { MetadataRoute } from "next";

import {
  ICON_BACKGROUND,
  installedAppName,
  THEME_COLORS,
} from "@/app/lib/installable-app";

/**
 * What lets browsers offer to install Glitter: a home-screen icon, full
 * screen, no browser bar. There is no service worker yet; it arrives with
 * push, and will never cache pages.
 */
export default function manifest(): MetadataRoute.Manifest {
  const name = installedAppName();
  return {
    id: "/",
    name,
    short_name: name,
    description: "Creamos festivales para que los artistas brillen",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: ICON_BACKGROUND,
    theme_color: THEME_COLORS.light,
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
