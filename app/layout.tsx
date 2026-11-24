import { Analytics } from "@vercel/analytics/react";
import type { Metadata, Viewport } from "next";

import ServiceWorkerMessages from "@/app/components/notifications/service-worker-messages";
import { ThemeProvider } from "@/app/components/theme-provider";
import { figtree, gabarito } from "@/ui/fonts";

import "./globals.css";
import { getEnvLabel } from "./lib/config";
import { MARK_INSTALLED_APP_SCRIPT } from "./lib/installed-app-mode";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  siteMetadataBase,
  withEnvLabel,
} from "./lib/site-metadata";
import { THEME_COLORS } from "./lib/theme-colors";

export const metadata: Metadata = {
  title: {
    template: withEnvLabel(`%s | ${SITE_NAME}`, getEnvLabel()),
    default: withEnvLabel(SITE_NAME, getEnvLabel()),
  },
  description: SITE_DESCRIPTION,
  keywords: ["festival", "glitter", "artistas", "ilustración", "arte"],
  metadataBase: siteMetadataBase(),
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  // No `appleWebApp` or apple icon here: InstalledAppHead renders those tags.
};

/**
 * The browser bar matches the navbar. These follow the device's light or dark
 * setting; ThemeProvider switches them to the theme the person picked in
 * Glitter once the page loads.
 */
export const viewport: Viewport = {
  // Lets the installed app's tab bar sit above the home indicator by
  // padding itself with `env(safe-area-inset-bottom)`, which reads zero
  // without it.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

/**
 * What every page shares, and nothing more: the document, the fonts, the
 * theme and page-view analytics. The site's header, app shell, footer, Clerk
 * and the installed app's tags (but not its window mark) belong to the `(site)` group's layout, so a
 * page outside it (`/links`, the link-in-bio page social profiles point to)
 * neither renders nor queries them.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // next-themes sets the theme class on <html> before React hydrates.
    // data-scroll-behavior tells the router that globals.css scrolls smoothly,
    // so it can switch that off while it jumps to the top of a new route.
    <html lang="es" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${figtree.variable} ${gabarito.variable} font-sans`}>
        {/* Marks the installed app's window (data-installed-app) before
            anything below paints, on every page, the root 404 included. Here,
            in the layout that never remounts: React does not run a script it
            inserts on the client. */}
        <script
          dangerouslySetInnerHTML={{ __html: MARK_INSTALLED_APP_SCRIPT }}
        />
        {/* On every page, /links and the 404 included: a tapped
            notification's message can reach any window of the installed
            app, and arrive as soon as the page loads. */}
        <ServiceWorkerMessages />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
