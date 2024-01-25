'use client';

import Link from 'next/link';

import {
  BadgePlusIcon,
  CircleUserIcon,
  LogInIcon,
  MenuIcon,
  SquareUserRoundIcon,
} from 'lucide-react';

import { londrinaSolid } from '@/app/ui/fonts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu';

import { Button } from '@/components/ui/button';
import MobileSidebar from '@/components/ui/mobile-sidebar';
import { currentUser, useUser } from '@clerk/nextjs';

const Navbar = () => {
  const user = useUser();
  console.log(user);

  return (
    <header>
      <nav className="p-3 w-full">
        <ul className="grid grid-cols-3 items-center">
          <li className="md:hidden">
            <MobileSidebar>
              <Button variant="ghost" size="icon">
                <MenuIcon className="h-6 w-6" />
              </Button>
            </MobileSidebar>
          </li>
          <li className="justify-self-center md:justify-self-start">
            <Link href="/">
              <span className={`${londrinaSolid.className} text-3xl`}>
                Glitter
              </span>
            </Link>
          </li>
          <li className="hidden md:block justify-self-center">
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <Link href="/" legacyBehavior passHref>
                    <NavigationMenuLink
                      className={navigationMenuTriggerStyle()}
                    >
                      Inicio
                    </NavigationMenuLink>
                  </Link>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <Link href="/next_event" legacyBehavior passHref>
                    <NavigationMenuLink
                      className={navigationMenuTriggerStyle()}
                    >
                      Próximo Evento
                    </NavigationMenuLink>
                  </Link>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </li>
          {user.isSignedIn ? (
            <li className="justify-self-end">
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button variant="ghost" size="icon">
                    <CircleUserIcon className="h-6 w-6" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Link href="/user_profile" className="flex align-middle">
                      <SquareUserRoundIcon className="self-center mr-2 h-4 w-4" />
                      <span>Perfil</span>
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ) : (
            <li className="justify-self-end">
              <Button variant="outline">
                <Link href="/sign_in">Ingresar</Link>
              </Button>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
};

export default Navbar;
