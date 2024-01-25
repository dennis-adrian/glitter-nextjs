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

type MobileSidebarItemProps = {
  href: string;
  children: React.ReactNode;
};

const MobileSidebarItem = ({ href, children }: MobileSidebarItemProps) => {
  return (
    <li>
      <Link href={href}>
        <SheetClose className="w-full text-left hover:bg-secondary rounded-md p-2">
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
  return (
    <Sheet>
      <SheetTrigger>{children}</SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>
            <SheetClose>
              <span className={`${londrinaSolid.className} text-3xl`}>
                Glitter
              </span>
            </SheetClose>
          </SheetTitle>
        </SheetHeader>
        <Separator className="my-2" />
        <ul className="flex flex-col">
          <MobileSidebarItem href="/">Inicio</MobileSidebarItem>
          <Separator className="my-2" />
          <MobileSidebarItem href="/sign_in">Ingresar</MobileSidebarItem>
          <MobileSidebarItem href="/sign_up">Registrarse</MobileSidebarItem>
        </ul>
      </SheetContent>
    </Sheet>
  );
};

export default MobileSidebar;
