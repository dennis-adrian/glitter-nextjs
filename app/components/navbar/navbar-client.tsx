"use client";

import GlitterLogo from "@/app/components/landing/glitter-logo";
import NavbarNavigationMenu from "@/app/components/navbar/navigation-menu";
import SessionButtons from "@/app/components/navbar/session-buttons";
import { useNavbarProfile } from "@/app/components/navbar/use-navbar-profile";
import MobileSidebar from "@/app/components/organisms/mobile-sidebar";
import { MenuIcon } from "lucide-react";
import Link from "next/link";

export default function NavbarClient() {
  const { profile } = useNavbarProfile();

  return (
    <ul className="grid w-full grid-cols-2 items-center md:grid-cols-3">
      <li className="flex items-center gap-2">
        <div className="md:hidden">
          <MobileSidebar profile={profile}>
            <MenuIcon className="h-5 w-5" />
          </MobileSidebar>
        </div>
        <Link href="/">
          <GlitterLogo
            className="md:hidden"
            variant="dark"
            height={40}
            width={40}
          />
          <GlitterLogo
            className="hidden md:block"
            variant="dark"
            height={48}
            width={48}
          />
        </Link>
      </li>
      <li className="hidden justify-self-center md:block">
        <NavbarNavigationMenu profile={profile} />
      </li>
      <li className="flex justify-self-end">
        <SessionButtons profile={profile} />
      </li>
    </ul>
  );
}
