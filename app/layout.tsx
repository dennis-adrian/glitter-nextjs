import { Analytics } from "@vercel/analytics/react";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import { esMX } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";

import PostHogAuthIdentify from "@/app/components/providers/posthog-identify";
import { ThemeProvider } from "@/app/components/theme-provider";

import { Toaster } from "@/components/ui/sonner";
import { figtree, gabarito } from "@/ui/fonts";

import CreditGiftCelebration from "@/app/components/credit_gifts/credit-gift-celebration";
import InstalledAppHead from "@/app/components/installed-app-head";
import Navbar from "@/app/components/navbar/navbar";
import ServiceWorkerMessages from "@/app/components/notifications/service-worker-messages";
import FooterServer from "@/app/components/footer-server";

import "./globals.css";
import { getEnvLabel } from "./lib/config";
import { THEME_COLORS } from "./lib/theme-colors";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

export const metadata: Metadata = {
  title: {
    template: `${getEnvLabel()} %s | Productora Glitter`,
    default: `${getEnvLabel()} Productora Glitter`,
  },
  description: "Creamos festivales para que los artistas brillen",
  keywords: ["festival", "glitter", "artistas", "ilustración", "arte"],
  metadataBase: new URL(baseUrl || "https://www.glitter.com.bo"),
  openGraph: {
    title: "Productora Glitter",
    description: "Creamos festivales para que los artistas brillen",
  },
  // No `appleWebApp` or apple icon here: InstalledAppHead renders those tags.
};

/**
 * The browser bar matches the navbar. These follow the device's light or dark
 * setting; ThemeProvider switches them to the theme the person picked in
 * Glitter once the page loads.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // next-themes sets the theme class on <html> before React hydrates.
    <html lang="es" suppressHydrationWarning>
      <body className={`${figtree.variable} ${gabarito.variable} font-sans`}>
        <InstalledAppHead />
        {/* Outside every Suspense boundary: a tapped notification's message
            can arrive as soon as the page loads. */}
        <ServiceWorkerMessages />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Suspense fallback={<div className="min-h-screen" />}>
            <ClerkProvider
              localization={esMX}
              appearance={{
                variables: { fontFamily: "var(--font-figtree), sans-serif" },
                elements: { headerTitle: "font-display" },
              }}
            >
              <Suspense fallback={<div className="h-[76px] lg:h-[84px]" />}>
                <Navbar />
              </Suspense>
              <Suspense fallback={null}>
                <CreditGiftCelebration />
              </Suspense>
              <main className="min-h-[calc(100vh-76px-180px)] md:min-h-[calc(100vh-76px-290px)] lg:min-h-[calc(100vh-84px-290px)]">
                {children}
              </main>
              <Suspense fallback={<div className="h-[180px] md:h-[290px]" />}>
                <FooterServer />
              </Suspense>
              <PostHogAuthIdentify />
              <Toaster richColors />
              <Analytics />
            </ClerkProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
