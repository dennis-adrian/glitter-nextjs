'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useClerk, useUser } from '@clerk/nextjs';
import { CircleUserIcon, LogOutIcon, UserIcon } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';

export default function UserDropdown() {
  const { signOut } = useClerk();
  const user = useUser();
  const router = useRouter();
  console.log(user);

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
          <DropdownMenuItem onClick={() => signOut(() => router.push('/'))}>
            <LogOutIcon className="mr-2 h-4 w-4" />
            <span>Cerrar Sesión</span>
          </DropdownMenuItem>
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
