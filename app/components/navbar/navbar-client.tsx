"use client";

import NavbarNavigationMenu from "@/app/components/navbar/navigation-menu";
import SessionButtons from "@/app/components/navbar/session-buttons";
import { useNavbarProfile } from "@/app/components/navbar/use-navbar-profile";
import MobileSidebar from "@/app/components/organisms/mobile-sidebar";
import { MenuIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type Props = {
  /** Null when the entry is switched off, gated, or nothing is published. */
  programsHref: string | null;
};

export default function NavbarClient({ programsHref }: Props) {
  const { profile } = useNavbarProfile();

  return (
    <header className="border-b border-brand-border bg-brand-elevated/95 backdrop-blur">
      <nav className="mx-auto flex h-[76px] w-full max-w-[1440px] items-center gap-4 px-5 sm:px-8 lg:h-[84px] lg:px-12 xl:px-20">
        <ul className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
          <li className="flex min-w-0 items-center gap-2">
            <div className="xl:hidden">
              <MobileSidebar profile={profile} programsHref={programsHref}>
                <MenuIcon className="h-5 w-5" />
              </MobileSidebar>
            </div>
            <Link
              href="/"
              aria-label="Productora Glitter, inicio"
              className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary"
            >
              <Image
                src="/img/logo/glitter-logo-full-primary-1696x739.png"
                alt="Productora Glitter"
                width={1696}
                height={739}
                sizes="(min-width: 1280px) 120px, (min-width: 640px) 108px, 88px"
                priority
                className="h-auto w-[88px] object-contain sm:w-[108px] xl:w-[120px]"
              />
            </Link>
          </li>
          <li className="hidden min-w-0 justify-self-center xl:block">
            <NavbarNavigationMenu
              profile={profile}
              programsHref={programsHref}
            />
          </li>
          <li className="flex shrink-0 justify-self-end">
            <SessionButtons profile={profile} />
          </li>
        </ul>
      </nav>
    </header>
  );
}
