'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { SignedIn, SignedOut, useClerk } from '@clerk/nextjs';

import { londrinaSolid } from '@/app/ui/fonts';

import { Separator } from '@/app/components/ui/separator';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/app/components/ui/sheet';
import { Button } from '@/app/components/ui/button';
import { HomeIcon, LogOutIcon } from 'lucide-react';
import Image from 'next/image';

type MobileSidebarItemProps = {
  href: string;
  children: React.ReactNode;
};

const MobileSidebarItem = ({ href, children }: MobileSidebarItemProps) => {
  return (
    <li>
      <SheetClose
        asChild
        className="flex hover:bg-secondary w-full rounded-md p-2 text-left"
      >
        <Link href={href}>{children}</Link>
      </SheetClose>
    </li>
  );
};

type MobileSidebarProps = {
  children: React.ReactNode;
};

const MobileSidebar = ({ children }: MobileSidebarProps) => {
  const { signOut } = useClerk();
  const router = useRouter();

  return (
    <Sheet>
      <SheetTrigger className="cursor-default" variant="ghost" size="icon">
        {children}
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>
            <SheetClose>
              <Link href="/">
                <Image
                  src="/img/logo-dark.png"
                  alt="Glitter Logo"
                  height={40}
                  width={96}
                />
              </Link>
            </SheetClose>
          </SheetTitle>
        </SheetHeader>
        <Separator className="my-2" />
        <ul className="flex flex-col">
          <MobileSidebarItem href="/">
            <HomeIcon className="mr-2 h-6 w-6" />
            Inicio
          </MobileSidebarItem>
          <Separator className="my-2" />
          <SignedIn>
            <SheetClose asChild>
              <Button
                className="p-2"
                onClick={() => signOut(() => router.push('/'))}
                variant="ghost"
              >
                <LogOutIcon className="mr-2 h-6 w-6" />
                <span className="w-full text-left text-base font-normal">
                  Cerrar Sesión
                </span>
              </Button>
            </SheetClose>
          </SignedIn>
          <SignedOut>
            <MobileSidebarItem href="/sign_in">Ingresar</MobileSidebarItem>
            <MobileSidebarItem href="/sign_up">Registrarse</MobileSidebarItem>
          </SignedOut>
        </ul>
      </SheetContent>
    </Sheet>
  );
};

export default MobileSidebar;
