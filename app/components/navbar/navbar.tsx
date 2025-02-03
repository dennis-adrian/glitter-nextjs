import ProfileAvatar from "@/app/components/common/profile-avatar";
import GlitterLogo from "@/app/components/landing/glitter-logo";
import CreateAccountButton from "@/app/components/molecules/create-account-button";
import NavbarNavigationMenu from "@/app/components/navbar/navigation-menu";
import { RedirectButton } from "@/app/components/redirect-button";
import NavigationSidebar from "@/app/components/ui/navigation-sidebar";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { LogInIcon, MenuIcon } from "lucide-react";
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
            {/* if the user is signed in, show the profile avatar. No matter the screen size */}
            <SignedIn>
              <NavigationSidebar profile={profile}>
                <ProfileAvatar
                  profile={profile!}
                  className="h-10 w-10"
                  showBadge={false}
                />
              </NavigationSidebar>
            </SignedIn>
            <SignedOut>
              <div className="block lg:hidden">
                <NavigationSidebar profile={profile}>
                  <MenuIcon className="h-5 w-5" />
                </NavigationSidebar>
              </div>
              <div className="gap-1 hidden lg:flex">
                <CreateAccountButton />
                <RedirectButton href="/sign_in" variant="outline">
                  <LogInIcon className="mr-1 h-5 w-5 hidden xl:block" />
                  Iniciar sesión
                </RedirectButton>
              </div>
            </SignedOut>
          </li>
        </ul>
      </nav>
    </header>
  );
}
