"use client";

import Link from "next/link";
import Image from "next/image";

import { MenuIcon } from "lucide-react";

import MobileSidebar from "@/app/components/ui/mobile-sidebar";
import UserDropdown from "@/app/components/ui/user-dropdown";
import NavbarNavigationMenu from "@/app/ui/navbar-navigation-menu";
import { usePathname, useSearchParams } from "next/navigation";

const Navbar = () => {
  const pathname = usePathname();

  return (
    <header
      className={
        pathname.includes("events") && pathname.includes("registration")
          ? "hidden"
          : ""
      }
    >
      <nav className="h-16 w-full container m-auto py-3 px-4 md:px-6">
        <ul className="grid grid-cols-3 items-center">
          <li className="md:hidden">
            <MobileSidebar>
              <MenuIcon className="h-6 w-6" />
            </MobileSidebar>
          </li>
          <li className="justify-self-center md:justify-self-start">
            <Link href="/">
              <Image
                src="/img/logo-dark.png"
                alt="Glitter Logo"
                height={40}
                width={96}
              />
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
