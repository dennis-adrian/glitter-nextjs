"use client";

import Link from "next/link";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/app/components/ui/navigation-menu";
import { useUser } from "@clerk/nextjs";
import { fetchUserProfile } from "../api/users/actions";
import { useEffect, useState } from "react";
import { ProfileType } from "../api/users/definitions";
import {
  CalendarCheck2Icon,
  HomeIcon,
  InboxIcon,
  UsersIcon,
} from "lucide-react";

const NavbarNavigationMenu = () => {
  const [profile, setProfile] = useState<ProfileType | null>(null);

  const user = useUser();

  useEffect(() => {
    if (user.user) {
      fetchUserProfile(user.user.id).then((data) => {
        if (data.user) {
          setProfile(data.user);
        }
      });
    }
  }, [user.user]);

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
        {/* <NavigationMenuItem>
          <Link href="/next_event" legacyBehavior passHref>
            <NavigationMenuLink
              className={navigationMenuTriggerStyle()}
            >
              Próximo Evento
            </NavigationMenuLink>
          </Link>
        </NavigationMenuItem> */}
        {profile && profile.role === "admin" && (
          <>
            <NavigationMenuItem>
              <Link href="/dashboard/users" legacyBehavior passHref>
                <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                  <div className="flex items-center">
                    <UsersIcon className="w-4 h-4 mr-1" />
                    Usuarios
                  </div>
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link href="/dashboard/requests" legacyBehavior passHref>
                <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                  <div className="flex items-center">
                    <InboxIcon className="w-4 h-4 mr-1" />
                    Solicitudes
                  </div>
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
          </>
        )}
      </NavigationMenuList>
    </NavigationMenu>
  );
};

export default NavbarNavigationMenu;
