"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MenuIcon } from "lucide-react";

import ThemeImage from "@/app/components/atoms/theme-image";
import { ModeToggle } from "@/app/components/mode-toggle";
import AppSidebar from "@/app/components/navbar/app-sidebar";
import AppTabBar from "@/app/components/navbar/app-tab-bar";
import {
  buildAppNavigation,
  PORTAL_HREF,
  type NavViewer,
} from "@/app/components/navbar/app-navigation";
import NavbarNavigationMenu from "@/app/components/navbar/navigation-menu";
import SessionButtons from "@/app/components/navbar/session-buttons";
import { useAppViewer } from "@/app/components/navbar/use-app-viewer";
import { useNavbarProfile } from "@/app/components/navbar/use-navbar-profile";
import MobileSidebar from "@/app/components/organisms/mobile-sidebar";
import { cn, isNoNavigationPage } from "@/app/lib/utils";

type Props = {
  /** Null when the entry is switched off, gated, or nothing is published. */
  programsHref: string | null;
  /** Hides the wallet entry in the user menu until credits are revealed. */
  creditsEnabled: boolean;
  /** Hides the blog entry until the blog is public. */
  blogEnabled: boolean;
  /** Shows the bell to whoever the `notifications` flag lets in. */
  notificationsEnabled: boolean;
  /** Offers avisos in the bell; null when they are not open to this viewer. */
  pushPublicKey?: string | null;
  /**
   * The signed-in viewer as the server saw it, so the app shell is in the
   * first HTML. Null when signed out, or on a page rendered without a request.
   */
  viewer?: NavViewer | null;
};

/**
 * The header, plus the app shell around it.
 *
 * Signed out, nothing changes: the public top navigation on wide screens and
 * the hamburger menu on narrow ones. Signed in, the desktop gets a sidebar in
 * place of the top navigation, and the installed app gets a bottom tab bar in
 * place of the hamburger. The bell always stays in the header.
 */
export default function NavbarClient({
  programsHref,
  creditsEnabled,
  blogEnabled,
  notificationsEnabled,
  pushPublicKey = null,
  viewer: serverViewer = null,
}: Props) {
  const { profile, isLoading } = useNavbarProfile();
  const pathname = usePathname() ?? "/";
  const { signedIn, viewer } = useAppViewer(serverViewer, profile);

  const navigation = buildAppNavigation({
    viewer,
    programsHref,
    blogEnabled,
    creditsEnabled,
  });

  const showShell = signedIn && !isNoNavigationPage(pathname);

  return (
    <>
      <header className="border-b border-brand-border bg-brand-elevated/95 backdrop-blur">
        <nav className="mx-auto flex h-[76px] w-full max-w-[1440px] items-center gap-4 px-5 sm:px-8 lg:h-[84px] lg:px-12 xl:px-20">
          <ul
            className={cn(
              "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3",
              !signedIn && "xl:grid-cols-[auto_minmax(0,1fr)_auto]",
            )}
          >
            <li className="flex min-w-0 items-center gap-2">
              {/* Signed in, the sidebar takes over from the desktop
                  breakpoint and the tab bar's "Más" in the installed app. */}
              <div
                className={cn(
                  signedIn ? "lg:hidden standalone:hidden" : "xl:hidden",
                )}
              >
                <MobileSidebar
                  profile={profile}
                  programsHref={programsHref}
                  blogEnabled={blogEnabled}
                  creditsEnabled={creditsEnabled}
                >
                  <MenuIcon className="h-5 w-5" />
                </MobileSidebar>
              </div>
              <Link
                href={signedIn ? PORTAL_HREF : "/"}
                aria-label="Productora Glitter, inicio"
                className={cn(
                  "shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary",
                  // The sidebar carries the wordmark on desktop.
                  showShell && "lg:hidden",
                )}
              >
                <ThemeImage
                  srcLight="/img/logo/glitter-logo-full-primary-1696x739.png"
                  srcDark="/img/logo/glitter-logo-full-white-1696x741.png"
                  alt="Productora Glitter"
                  width={1696}
                  height={739}
                  sizes="(min-width: 1280px) 120px, (min-width: 640px) 108px, 88px"
                  // Both wordmarks are a few KB; fetching the hidden one too
                  // beats holding back the page's largest paint.
                  loading="eager"
                  fetchPriority="high"
                  className="h-auto w-[88px] object-contain sm:w-[108px] xl:w-[120px]"
                />
              </Link>
            </li>
            {signedIn ? null : (
              <li className="hidden min-w-0 justify-self-center xl:block">
                <NavbarNavigationMenu
                  programsHref={programsHref}
                  blogEnabled={blogEnabled}
                />
              </li>
            )}
            <li className="flex shrink-0 items-center gap-2 justify-self-end">
              {/* No room beside the session buttons on the narrowest phones;
                  the mobile menu carries the same control there, and the
                  sidebar does on desktop. */}
              <ModeToggle
                className={cn(
                  "hidden sm:inline-flex",
                  showShell && "lg:hidden",
                )}
              />
              <SessionButtons
                profile={profile}
                creditsEnabled={creditsEnabled}
                notificationsEnabled={notificationsEnabled}
                pushPublicKey={pushPublicKey}
                isProfileLoading={isLoading}
                accountMenuClassName={showShell ? "lg:hidden" : undefined}
              />
            </li>
          </ul>
        </nav>
      </header>
      {showShell ? (
        <>
          <AppSidebar
            groups={navigation.groups}
            profile={profile}
            viewer={viewer}
          />
          <AppTabBar tabs={navigation.tabs} />
        </>
      ) : null}
    </>
  );
}
