import GlitterLogo from "@/app/components/landing/glitter-logo";
import NavbarNavigationMenu from "@/app/components/navbar/navigation-menu";
import { RedirectButton } from "@/app/components/redirect-button";
import MobileSidebar from "@/app/components/ui/mobile-sidebar";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { LogInIcon, MenuIcon, UserPlusIcon } from "lucide-react";
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
          <li className="lg:hidden justify-self-end">
            <MobileSidebar profile={profile}>
              <MenuIcon className="h-5 w-5" />
            </MobileSidebar>
          </li>
          <SignedIn>
            <li>hello</li>
          </SignedIn>
          <SignedOut>
            <li className="hidden lg:flex justify-self-end">
              <div className="flex gap-1">
                <RedirectButton href="/sign_up" variant="ghost">
                  <UserPlusIcon className="mr-2 h-5 w-5 hidden xl:block" />
                  Crear cuenta
                </RedirectButton>
                <RedirectButton href="/sign_in" variant="outline">
                  <LogInIcon className="mr-1 h-5 w-5 hidden xl:block" />
                  Iniciar sesión
                </RedirectButton>
              </div>
            </li>
          </SignedOut>
        </ul>
      </nav>
    </header>
  );
}
