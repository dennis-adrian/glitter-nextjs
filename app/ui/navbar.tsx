import Link from 'next/link';
import { MenuIcon } from 'lucide-react';

import MobileSidebar from '@/app/components/ui/mobile-sidebar';
import UserDropdown from '@/app/components/ui/user-dropdown';
import NavbarNavigationMenu from '@/app/ui/navbar-navigation-menu';
import Image from 'next/image';

const Navbar = () => {
  return (
    <header>
      <nav className="w-full shadow-sm p-3 h-16">
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
