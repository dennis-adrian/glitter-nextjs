import { Analytics } from "@vercel/analytics/react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { esMX } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";

import PostHogAuthIdentify from "@/app/components/providers/posthog-identify";
import StaleDeploymentListener from "@/app/components/providers/stale-deployment-listener";
import { ThemeProvider } from "@/app/components/theme-provider";

import { Toaster } from "@/components/ui/sonner";
import { figtree, gabarito } from "@/ui/fonts";

import Navbar from "@/app/components/navbar/navbar";
import FooterServer from "@/app/components/footer-server";

import "./globals.css";
import { getEnvLabel } from "./lib/config";

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
};

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
              <main className="min-h-[calc(100vh-76px-180px)] md:min-h-[calc(100vh-76px-290px)] lg:min-h-[calc(100vh-84px-290px)]">
                {children}
              </main>
              <Suspense fallback={<div className="h-[180px] md:h-[290px]" />}>
                <FooterServer />
              </Suspense>
              <PostHogAuthIdentify />
              <Toaster richColors />
              <StaleDeploymentListener />
              <Analytics />
            </ClerkProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
