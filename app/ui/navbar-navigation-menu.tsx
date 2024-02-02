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
              Inicio
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
          <NavigationMenuItem>
            <Link href="/dashboard/users">
              <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                Users
              </NavigationMenuLink>
            </Link>
          </NavigationMenuItem>
        )}
      </NavigationMenuList>
    </NavigationMenu>
  );
};

export default NavbarNavigationMenu;
