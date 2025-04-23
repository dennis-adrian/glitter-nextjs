"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useUser } from "@clerk/nextjs";
import { CircleUserIcon, ListIcon, UserIcon } from "lucide-react";

import { ProfileType } from "@/app/api/users/definitions";

import SignOutButton from "@/app/components/user_dropdown/sign-out-button";
import { UserDropdownSkeleton } from "@/app/components/user_dropdown/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RedirectButton } from "@/app/components/redirect-button";

export default function UserDropdown({
  profile,
}: {
  profile?: ProfileType | null;
}) {
  const clerk = useUser();
  const pathname = usePathname();

  if (pathname.includes("festivals") && pathname.includes("registration"))
    return null;

  if (!clerk.isLoaded || (clerk.isSignedIn && !profile)) {
    return <UserDropdownSkeleton />;
  }

  if (clerk.isSignedIn && profile) {
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
            <Link href="/my_profile">
              <UserIcon className="mr-2 h-4 w-4" />
              <span>Mi perfil</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/my_participations">
              <ListIcon className="mr-2 h-4 w-4" />
              <span>Mis participaciones</span>
            </Link>
          </DropdownMenuItem>
          <SignOutButton />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (!(pathname === "/sign_in" || pathname === "/sign_up")) {
    return (
      <RedirectButton href="/sign_in" variant="outline">
        Ingresar
      </RedirectButton>
    );
  }

  return null;
}
