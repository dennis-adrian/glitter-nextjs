'use client';

import Image from 'next/image';
import Link from 'next/link';

import { useUser } from '@clerk/nextjs';
import { CircleUserIcon, UserIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import SignOutButton from '@/app/components/user_dropdown/sign-out-button';

export default function UserDropdown() {
  const user = useUser();

  if (user.isSignedIn) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger className="cursor-default">
          {user.user.imageUrl ? (
            <Image
              src={user.user.imageUrl}
              alt={user.user.fullName!}
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
            {user.user.fullName}
            <br />
            <span className="text-muted-foreground font-normal">
              {user.user.emailAddresses[0].emailAddress}
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
