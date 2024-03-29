"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MenuIcon } from "lucide-react";

import GlitterLogo from "@/app/components/landing/glitter-logo";
import MobileSidebar from "@/app/components/ui/mobile-sidebar";
import UserDropdown from "@/app/components/ui/user-dropdown";
import NavbarNavigationMenu from "@/app/ui/navbar-navigation-menu";

const Navbar = () => {
  const pathname = usePathname();

  return (
    <header
      className={
        pathname.includes("festivals") && pathname.includes("registration")
          ? "hidden"
          : ""
      }
    >
      <nav className="w-full container m-auto py-3 md:py-4 px-4 md:px-6">
        <ul className="grid grid-cols-3 items-center">
          <li className="md:hidden">
            <MobileSidebar>
              <MenuIcon className="h-6 w-6" />
            </MobileSidebar>
          </li>
          <li className="justify-self-center md:justify-self-start">
            <Link href="/">
              <GlitterLogo variant="dark" />
            </Link>
          </li>
          <li className="hidden justify-self-center md:block">
            <NavbarNavigationMenu />
          </li>
          <li className="flex justify-self-end">
            <UserDropdown />
          </li>
        </ul>
      </nav>
    </header>
  );
};

export default Navbar;
