'use client';

import Link from 'next/link';
import { MenuIcon } from 'lucide-react';

import MobileSidebar from '@/app/components/ui/mobile-sidebar';
import UserDropdown from '@/app/components/ui/user-dropdown';
import NavbarNavigationMenu from '@/app/ui/navbar-navigation-menu';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/app/lib/utils';

const Navbar = () => {
  const pathname = usePathname();

  return (
    <header>
      <nav className={cn("w-full p-3 h-16", {
        "bg-blue-900 text-accent-foreground shadow-sm": pathname === "/",
      })}>
        <ul className="grid grid-cols-3 items-center">
          <li className="md:hidden">
            <MobileSidebar>
              <MenuIcon className="h-6 w-6" />
            </MobileSidebar>
          </li>
          <li className="justify-self-center md:justify-self-start">
            <Link href="/">
              {pathname === '/' ? (
                <Image
                  src="/img/glitter-logo.png"
                  alt="Glitter Logo"
                  height={50}
                  width={120}
                />
              ) : (
                <Image
                  src="/img/logo-dark.png"
                  alt="Glitter Logo"
                  height={40}
                  width={96}
                />
              )}
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
