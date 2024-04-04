"use client";

import Link from "next/link";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/app/components/ui/navigation-menu";
import {
  AlbumIcon,
  CalendarCheck2Icon,
  HomeIcon,
  InboxIcon,
  LayoutDashboardIcon,
  UsersIcon,
} from "lucide-react";
import { ProfileType } from "../../api/users/definitions";

const NavbarNavigationMenu = ({
  profile,
}: {
  profile?: ProfileType | null;
}) => {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <Link href="/" legacyBehavior passHref>
            <NavigationMenuLink className={navigationMenuTriggerStyle()}>
              <div className="flex items-center">
                <HomeIcon className="w-4 h-4 mr-1" />
                Inicio
              </div>
            </NavigationMenuLink>
          </Link>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <Link href="/next_event" legacyBehavior passHref>
            <NavigationMenuLink className={navigationMenuTriggerStyle()}>
              <div className="flex items-center">
                <CalendarCheck2Icon className="w-4 h-4 mr-1" />
                Próximo Evento
              </div>
            </NavigationMenuLink>
          </Link>
        </NavigationMenuItem>
        {profile && profile.role === "admin" && (
          <NavigationMenuItem>
            <NavigationMenuTrigger>
              <div className="flex items-center">
                <LayoutDashboardIcon className="w-4 h-4 mr-1" />
                Dashboard
              </div>
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className="grid p-4 w-[550px] md:grid-cols-4 lg:w-[600px]">
                <li>
                  <Link href="/dashboard" legacyBehavior passHref>
                    <NavigationMenuLink
                      className={navigationMenuTriggerStyle()}
                    >
                      <div className="flex items-center">
                        <LayoutDashboardIcon className="w-4 h-4 mr-1" />
                        Dashboard
                      </div>
                    </NavigationMenuLink>
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard/users" legacyBehavior passHref>
                    <NavigationMenuLink
                      className={navigationMenuTriggerStyle()}
                    >
                      <div className="flex items-center">
                        <UsersIcon className="w-4 h-4 mr-1" />
                        Usuarios
                      </div>
                    </NavigationMenuLink>
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard/requests" legacyBehavior passHref>
                    <NavigationMenuLink
                      className={navigationMenuTriggerStyle()}
                    >
                      <div className="flex items-center">
                        <InboxIcon className="w-4 h-4 mr-1" />
                        Solicitudes
                      </div>
                    </NavigationMenuLink>
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard/reservations" legacyBehavior passHref>
                    <NavigationMenuLink
                      className={navigationMenuTriggerStyle()}
                    >
                      <div className="flex items-center">
                        <AlbumIcon className="w-4 h-4 mr-1" />
                        Reservas
                      </div>
                    </NavigationMenuLink>
                  </Link>
                </li>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
        )}
      </NavigationMenuList>
    </NavigationMenu>
  );
};

export default NavbarNavigationMenu;
