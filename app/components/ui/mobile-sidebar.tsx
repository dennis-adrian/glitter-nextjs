'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useClerk, useUser } from '@clerk/nextjs';

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

type MobileSidebarItemProps = {
  href: string;
  children: React.ReactNode;
};

const MobileSidebarItem = ({ href, children }: MobileSidebarItemProps) => {
  return (
    <li>
      <SheetClose
        asChild
        className="hover:bg-secondary w-full rounded-md p-2 text-left"
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
  const user = useUser();
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
                <span className={`${londrinaSolid.className} text-3xl`}>
                  Glitter
                </span>
              </Link>
            </SheetClose>
          </SheetTitle>
        </SheetHeader>
        <Separator className="my-2" />
        <ul className="flex flex-col">
          <MobileSidebarItem href="/">Inicio</MobileSidebarItem>
          <Separator className="my-2" />
          {user.isSignedIn ? (
            <SheetClose asChild>
              <Button
                className="p-2"
                onClick={() => signOut(() => router.push('/'))}
                variant="ghost"
              >
                <span className="w-full text-left text-base font-normal">
                  Cerrar Sesión
                </span>
              </Button>
            </SheetClose>
          ) : (
            <>
              <MobileSidebarItem href="/sign_in">Ingresar</MobileSidebarItem>
              <MobileSidebarItem href="/sign_up">Registrarse</MobileSidebarItem>
            </>
          )}
        </ul>
      </SheetContent>
    </Sheet>
  );
};

export default MobileSidebar;
