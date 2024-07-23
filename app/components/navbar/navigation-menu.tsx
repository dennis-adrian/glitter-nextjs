"use client";

import Link from "next/link";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuListItem,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/app/components/ui/navigation-menu";
import {
  CalendarCheck2Icon,
  HomeIcon,
  LayoutDashboardIcon,
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
          <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
            <Link href="/">
              <div className="flex items-center">
                <HomeIcon className="w-4 h-4 mr-1" />
                Inicio
              </div>
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
            <Link href="/next_event">
              <div className="flex items-center">
                <CalendarCheck2Icon className="w-4 h-4 mr-1" />
                Próximo Evento
              </div>
            </Link>
          </NavigationMenuLink>
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
              <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                <NavigationMenuListItem
                  title="Usuarios"
                  href="/dashboard/users"
                >
                  Todas las cuentas creadas en Glitter
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Reservas"
                  href="/dashboard/reservations"
                >
                  Todas las reservas que se han hecho
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Pagos"
                  href="/dashboard/payments"
                >
                  Verifica los pagos hechos por reservas
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Festivales"
                  href="/dashboard/festivals"
                >
                  Festivales que han sido organizados por Glitter
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Etiquetas"
                  href="/dashboard/tags"
                >
                  Etiquetas para los usuarios
                </NavigationMenuListItem>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
        )}
      </NavigationMenuList>
    </NavigationMenu>
  );
};

export default NavbarNavigationMenu;
