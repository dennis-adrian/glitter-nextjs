"use client";

import { useEffect, useState } from "react";

import Image from "next/image";
import Link from "next/link";

import { useUser } from "@clerk/nextjs";
import { CircleUserIcon, UserIcon } from "lucide-react";

import { fetchUserProfile } from "@/app/api/users/actions";
import { ProfileType } from "@/app/api/users/definitions";

import SignOutButton from "@/app/components/user_dropdown/sign-out-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname } from "next/navigation";

export default function UserDropdown() {
  const user = useUser();
  const pathname = usePathname();
  const [profile, setProfile] = useState<ProfileType>();

  useEffect(() => {
    if (user.user) {
      fetchUserProfile(user.user.id).then((data) => {
        setProfile(data.user);
      });
    }
  }, [user.user]);

  if (user.isSignedIn && profile) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger className="cursor-default">
          {profile.imageUrl ? (
            <div className="relative h-8 w-8 rounded-full bg-gray-200">
              <Image
                src={profile.imageUrl}
                alt={profile.displayName || "nombre del usuario"}
                width={32}
                height={32}
                className="absolute inset-0 h-full w-full rounded-full object-cover"
              />
            </div>
          ) : (
            <CircleUserIcon className="h-6 w-6" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="mr-4">
          <DropdownMenuLabel>
            {profile.displayName}
            <br />
            <span className="text-muted-foreground font-normal">
              {profile.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/user_profile">
              <UserIcon className="mr-2 h-4 w-4" />
              <span>Perfil</span>
            </Link>
          </DropdownMenuItem>
          <SignOutButton />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Link href="/sign_in">
      {pathname === "/" ? (
        <Button
          className="hover:bg-secondary hover:text-secondary-foreground bg-blue-900"
          variant="outline"
        >
          Ingresar
        </Button>
      ) : (
        <Button variant="outline">Ingresar</Button>
      )}
    </Link>
  );
}
