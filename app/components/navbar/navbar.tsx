import GlitterLogo from "@/app/components/landing/glitter-logo";
import NavbarNavigationMenu from "@/app/components/navbar/navigation-menu";
import MobileSidebar from "@/app/components/ui/mobile-sidebar";
import UserDropdown from "@/app/components/ui/user-dropdown";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { MenuIcon } from "lucide-react";
import Link from "next/link";

export default async function Navbar() {
  const profile = await getCurrentUserProfile();

  return (
    <header>
      <nav className="w-full h-16 md:h-20 container m-auto py-3 md:py-4 px-4 md:px-6 flex items-center">
        <ul className="grid grid-cols-3 items-center w-full">
          <li className="md:hidden">
            <MobileSidebar profile={profile}>
              <MenuIcon className="h-5 w-5" />
            </MobileSidebar>
          </li>
          <li className="justify-self-center md:justify-self-start">
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
            <UserDropdown profile={profile} />
          </li>
        </ul>
      </nav>
    </header>
  );
}
