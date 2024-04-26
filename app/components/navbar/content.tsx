"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MenuIcon } from "lucide-react";

import GlitterLogo from "@/app/components/landing/glitter-logo";
import MobileSidebar from "@/app/components/ui/mobile-sidebar";
import UserDropdown from "@/app/components/ui/user-dropdown";
import NavbarNavigationMenu from "@/app/components/navbar/navigation-menu";
import { ProfileType } from "@/app/api/users/definitions";

export default function NavbarContent({
  profile,
}: {
  profile?: ProfileType | null;
}) {
  const pathname = usePathname();

  return (
    <header
      className={
        pathname.includes("festivals") && pathname.includes("registration")
          ? "hidden"
          : ""
      }
    >
      <nav className="w-full h-16 md:h-20 container m-auto py-3 md:py-4 px-4 md:px-6 flex items-center">
        <ul className="grid grid-cols-3 items-center w-full">
          <li className="md:hidden">
            <MobileSidebar profile={profile}>
              <MenuIcon className="h-5 w-5" />
            </MobileSidebar>
          </li>
          <li className="justify-self-center md:justify-self-start">
            <Link className="hidden md:block" href="/">
              <GlitterLogo variant="dark" size="md" />
            </Link>
            <Link className="md:hidden" href="/">
              <GlitterLogo variant="dark" size="sm" />
            </Link>
          </li>
          <li className="hidden justify-self-center md:block">
            <NavbarNavigationMenu profile={profile} />
          </li>
          <li className="flex justify-self-end">
            <UserDropdown profile={profile} />
          </li>
        </ul>
      </nav>
    </header>
  );
}
