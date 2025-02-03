import GlitterLogo from "@/app/components/landing/glitter-logo";
import NavbarNavigationMenu from "@/app/components/navbar/navigation-menu";
import SessionButtons from "@/app/components/navbar/session-buttons";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import Link from "next/link";

export default async function Navbar() {
  const profile = await getCurrentUserProfile();

  return (
    <header>
      <nav className="w-full h-16 md:h-20 container m-auto py-3 md:py-4 px-4 md:px-6 flex items-center">
        <ul className="grid grid-cols-2 lg:grid-cols-3 items-center w-full">
          <li className="justify-self-start">
            <Link href="/">
              <GlitterLogo
                className="lg:hidden"
                variant="dark"
                height={40}
                width={40}
              />
              <GlitterLogo
                className="hidden lg:block"
                variant="dark"
                height={48}
                width={48}
              />
            </Link>
          </li>
          <li className="hidden justify-self-center lg:block">
            <NavbarNavigationMenu profile={profile} />
          </li>
          <li className="justify-self-end">
            <SessionButtons profile={profile} />
          </li>
        </ul>
      </nav>
    </header>
  );
}
