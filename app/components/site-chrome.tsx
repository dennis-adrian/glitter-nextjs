import { Suspense } from "react";

import { esMX } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";

import CreditGiftCelebration from "@/app/components/credit_gifts/credit-gift-celebration";
import FooterServer from "@/app/components/footer-server";
import InstalledAppHead from "@/app/components/installed-app-head";
import InstalledAppMark from "@/app/components/installed-app-mark";
import Navbar from "@/app/components/navbar/navbar";
import { ScreenBarProvider } from "@/app/components/navbar/screen-bar";
import ScrollToTopOnNavigation from "@/app/components/navbar/scroll-to-top";
import PostHogAuthIdentify from "@/app/components/providers/posthog-identify";
import StaleDeploymentListener from "@/app/components/providers/stale-deployment-listener";
import { Toaster } from "@/components/ui/sonner";

/**
 * The site around a page: the installed app's tags, Clerk, the navbar (with
 * the app shell inside it), the page in `main`, and the footer. Only the
 * `(site)` group's layout renders it. The root 404 (`app/not-found.tsx`)
 * must not: Next sends that file with every page, `/links` included, so
 * wrapping it here would put Clerk and the navbar back on every page.
 */
export default function SiteChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <InstalledAppHead />
      <InstalledAppMark />
      <Suspense fallback={<div className="min-h-screen" />}>
        <ClerkProvider
          localization={esMX}
          appearance={{
            variables: { fontFamily: "var(--font-figtree), sans-serif" },
            elements: { headerTitle: "font-display" },
          }}
        >
          {/* Lets a page give the installed app's top bar its title. */}
          <ScreenBarProvider>
            {/* Every new screen opens at its top, whatever the last one's
                scroll was. */}
            <ScrollToTopOnNavigation />
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
          </ScreenBarProvider>
          <PostHogAuthIdentify />
          <Toaster richColors />
          <StaleDeploymentListener />
        </ClerkProvider>
      </Suspense>
    </>
  );
}
