"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import clsx from "clsx";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/app/components/ui/navigation-menu";

const NavbarNavigationMenu = () => {
  const pathname = usePathname();
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <Link href="/" legacyBehavior passHref>
            <NavigationMenuLink
              className={clsx(navigationMenuTriggerStyle(), {
                "hover:bg-secondary hover:text-secondary-foreground bg-blue-900":
                  pathname === "/",
              })}
            >
              Inicio
            </NavigationMenuLink>
          </Link>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <Link href="/next_event" legacyBehavior passHref>
            <NavigationMenuLink
              className={clsx(navigationMenuTriggerStyle(), {
                "hover:bg-secondary hover:text-secondary-foreground bg-blue-900":
                  pathname === "/",
              })}
            >
              Próximo Evento
            </NavigationMenuLink>
          </Link>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
};

export default NavbarNavigationMenu;
