'use client';

import { useEffect, useState } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import { useUser } from '@clerk/nextjs';
import { CircleUserIcon, UserIcon } from 'lucide-react';

import { UserProfileType, fetchUserProfile } from '@/app/api/users/actions';
import SignOutButton from '@/app/components/user_dropdown/sign-out-button';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function UserDropdown() {
  const user = useUser();
  const [profile, setProfile] = useState<UserProfileType>();

  useEffect(() => {
    if (user.user) {
      fetchUserProfile(user.user.id).then((data) => {
        setProfile(data.user);
      });
    }
  }, [user]);

  if (user.isSignedIn && profile) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger className="cursor-default">
          {profile.imageUrl ? (
            <Image
              src={profile.imageUrl}
              alt={profile.displayName || 'nombre del usuario'}
              width={32}
              height={32}
              className="rounded-full"
            />
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
      <Button variant="outline">Ingresar</Button>
    </Link>
  );
}
