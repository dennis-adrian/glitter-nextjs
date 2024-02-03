"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { SignedIn, SignedOut, useClerk, useUser } from "@clerk/nextjs";

import { Separator } from "@/app/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/app/components/ui/sheet";
import { Button } from "@/app/components/ui/button";
import { HomeIcon, InboxIcon, LogOutIcon, UsersIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ProfileType } from "@/app/api/users/definitions";
import { fetchUserProfile } from "@/app/api/users/actions";

type MobileSidebarItemProps = {
  href: string;
  children: React.ReactNode;
};

const MobileSidebarItem = ({ href, children }: MobileSidebarItemProps) => {
  return (
    <li>
      <SheetClose
        asChild
        className="hover:bg-accent hover:text-accent-foreground flex w-full rounded-md p-2 text-left"
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
          {profile && profile.role === "admin" && (
            <>
              <MobileSidebarItem href="/dashboard/users">
                <UsersIcon className="mr-2 h-6 w-6" />
                Usuarios
              </MobileSidebarItem>
              <MobileSidebarItem href="/dashboard/requests">
                <InboxIcon className="mr-2 h-6 w-6" />
                Solicitudes
              </MobileSidebarItem>
            </>
          )}
          <Separator className="my-2" />
          <SignedIn>
            <SheetClose asChild>
              <Button
                className="p-2"
                onClick={() => signOut(() => router.push("/"))}
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
