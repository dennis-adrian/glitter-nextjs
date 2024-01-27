'use client';

import Link from 'next/link';

import { londrinaSolid } from '@/app/ui/fonts';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useUser } from '@clerk/nextjs';

type MobileSidebarItemProps = {
  href: string;
  children: React.ReactNode;
};

const MobileSidebarItem = ({ href, children }: MobileSidebarItemProps) => {
  return (
    <li>
      <Link href={href}>
        <SheetClose className="hover:bg-secondary w-full rounded-md p-2 text-left">
          {children}
        </SheetClose>
      </Link>
    </li>
  );
};

type MobileSidebarProps = {
  children: React.ReactNode;
};

const MobileSidebar = ({ children }: MobileSidebarProps) => {
  const user = useUser();

  return (
    <Sheet>
      <SheetTrigger variant="ghost" size="icon">
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
            <MobileSidebarItem href="/">Cerrar Sesión</MobileSidebarItem>
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
