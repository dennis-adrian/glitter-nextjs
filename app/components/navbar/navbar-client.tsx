"use client";

import ThemeImage from "@/app/components/atoms/theme-image";
import { ModeToggle } from "@/app/components/mode-toggle";
import NavbarNavigationMenu from "@/app/components/navbar/navigation-menu";
import SessionButtons from "@/app/components/navbar/session-buttons";
import { useNavbarProfile } from "@/app/components/navbar/use-navbar-profile";
import MobileSidebar from "@/app/components/organisms/mobile-sidebar";
import { MenuIcon } from "lucide-react";
import Link from "next/link";

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
};

export default function NavbarClient({
  programsHref,
  creditsEnabled,
  blogEnabled,
  notificationsEnabled,
  pushPublicKey = null,
}: Props) {
  const { profile, isLoading } = useNavbarProfile();

  return (
    <header className="border-b border-brand-border bg-brand-elevated/95 backdrop-blur">
      <nav className="mx-auto flex h-[76px] w-full max-w-[1440px] items-center gap-4 px-5 sm:px-8 lg:h-[84px] lg:px-12 xl:px-20">
        <ul className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
          <li className="flex min-w-0 items-center gap-2">
            <div className="xl:hidden">
              <MobileSidebar
                profile={profile}
                programsHref={programsHref}
                blogEnabled={blogEnabled}
              >
                <MenuIcon className="h-5 w-5" />
              </MobileSidebar>
            </div>
            <Link
              href="/"
              aria-label="Productora Glitter, inicio"
              className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary"
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
          <li className="hidden min-w-0 justify-self-center xl:block">
            <NavbarNavigationMenu
              profile={profile}
              programsHref={programsHref}
              blogEnabled={blogEnabled}
            />
          </li>
          <li className="flex shrink-0 items-center gap-2 justify-self-end">
            {/* No room beside the session buttons on the narrowest phones;
                the mobile menu carries the same control there. */}
            <ModeToggle className="hidden sm:inline-flex" />
            <SessionButtons
              profile={profile}
              creditsEnabled={creditsEnabled}
              notificationsEnabled={notificationsEnabled}
              pushPublicKey={pushPublicKey}
              isProfileLoading={isLoading}
            />
          </li>
        </ul>
      </nav>
    </header>
  );
}
