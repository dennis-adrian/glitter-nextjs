"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SignedIn, SignedOut, useClerk } from "@clerk/nextjs";

import { ProfileType } from "@/app/api/users/definitions";
import GlitterLogo from "@/app/components/landing/glitter-logo";
import { RedirectButton } from "@/app/components/redirect-button";
import { Button } from "@/app/components/ui/button";
import { Separator } from "@/app/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/app/components/ui/sheet";
import ProfileQuickViewInfo from "@/app/components/users/profile-quick-view-info";
import { cn } from "@/app/lib/utils";
import {
  AlbumIcon,
  BookImageIcon,
  BoxesIcon,
  CalendarCheck2Icon,
  CalendarIcon,
  CreditCardIcon,
  HomeIcon,
  LogInIcon,
  LogOutIcon,
  StickerIcon,
  TagsIcon,
  UserIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";

type MobileSidebarItemProps = {
  href: string;
  children: React.ReactNode;
  isMobileOnly?: boolean;
};

const MobileSidebarItem = ({
  href,
  children,
  isMobileOnly = false,
}: MobileSidebarItemProps) => {
  return (
    <li className={cn({ "lg:hidden": isMobileOnly })}>
      <SheetClose
        asChild
        className="hover:bg-accent hover:text-accent-foreground flex w-full rounded-md p-2 text-left"
      >
        <Link href={href}>{children}</Link>
      </SheetClose>
    </li>
  );
};

type NavigationSidebarProps = {
  profile?: ProfileType | null;
  children: React.ReactNode;
  onCreateAccountClick: () => void;
};

const NavigationSidebar = ({
  children,
  profile,
  onCreateAccountClick,
}: NavigationSidebarProps) => {
  const { signOut } = useClerk();
  const pathname = usePathname();

  if (pathname.includes("festivals") && pathname.includes("registration")) {
    return null;
  }

  return (
    <Sheet>
      <SheetTrigger
        className={cn(
          "cursor-default hover:bg-primary-100/30 hover:text-primary-500 border-none flex items-center justify-center",
          {
            "rounded-full": profile,
          },
        )}
        variant="outline"
        size="icon"
      >
        {children}
      </SheetTrigger>
      <SheetContent side="right" className="p-3">
        <SheetHeader>
          <SheetTitle>
            <SheetClose asChild>
              <Link href="/">
                <GlitterLogo variant="dark" height={48} width={48} />
              </Link>
            </SheetClose>
          </SheetTitle>
        </SheetHeader>
        <Separator className="my-2" />
        {profile && (
          <div className="flex flex-col gap-2">
            <ProfileQuickViewInfo
              profile={profile}
              avatarClassName="h-10 w-10"
            />
            <SheetClose asChild>
              <RedirectButton
                href="/my_profile"
                variant="outline"
                className="w-full"
              >
                <UserIcon className="mr-2 h-6 w-6" />
                <span>Ir a mi perfil</span>
              </RedirectButton>
            </SheetClose>
            <Separator className="mb-2 lg:hidden" />
          </div>
        )}
        <ul className="flex flex-col">
          <MobileSidebarItem isMobileOnly href="/">
            <HomeIcon className="mr-2 h-6 w-6" />
            Inicio
          </MobileSidebarItem>
          <MobileSidebarItem isMobileOnly href="/next_event">
            <CalendarCheck2Icon className="mr-2 h-6 w-6" />
            Próximo Evento
          </MobileSidebarItem>
          <MobileSidebarItem href="/festivals">
            <BookImageIcon className="mr-2 h-6 w-6" />
            Festivales
          </MobileSidebarItem>
          <div className="ml-4">
            <MobileSidebarItem href="/festivals/festicker">
              <StickerIcon className="mr-2 h-6 w-6" />
              Festicker
            </MobileSidebarItem>
          </div>
          <MobileSidebarItem isMobileOnly href="/festivals/categories">
            <BoxesIcon className="w-6 h-6 mr-2" />
            Categorías Glitter
          </MobileSidebarItem>
          {profile && profile.role === "admin" && (
            <>
              <MobileSidebarItem isMobileOnly href="/dashboard">
                <h4 className="text-lg">Dashboard</h4>
              </MobileSidebarItem>
              <div className="ml-4">
                <MobileSidebarItem
                  isMobileOnly
                  href="/dashboard/users?limit=10&offset=0&includeAdmins=false&status=pending&sort=updatedAt&direction=desc&profileCompletion=complete"
                >
                  <UsersIcon className="mr-2 h-6 w-6" />
                  Usuarios
                </MobileSidebarItem>
                <MobileSidebarItem isMobileOnly href="/dashboard/reservations">
                  <AlbumIcon className="mr-2 h-6 w-6" />
                  Reservas
                </MobileSidebarItem>
                <MobileSidebarItem isMobileOnly href="/dashboard/payments">
                  <CreditCardIcon className="mr-2 h-6 w-6" />
                  Pagos
                </MobileSidebarItem>
                <MobileSidebarItem isMobileOnly href="/dashboard/festivals">
                  <CalendarIcon className="mr-2 h-6 w-6" />
                  Festivales
                </MobileSidebarItem>
                <MobileSidebarItem isMobileOnly href="/dashboard/subcategories">
                  <BoxesIcon className="mr-2 h-6 w-6" />
                  Subcategorías
                </MobileSidebarItem>
                <MobileSidebarItem isMobileOnly href="/dashboard/tags">
                  <TagsIcon className="mr-2 h-6 w-6" />
                  Etiquetas
                </MobileSidebarItem>
              </div>
            </>
          )}
          <Separator className="my-2" />
          <SignedIn>
            <SheetClose asChild>
              <div className="flex flex-col gap-1">
                <Button
                  className="p-2"
                  onClick={() => signOut()}
                  variant="ghost"
                >
                  <LogOutIcon className="mr-2 h-6 w-6" />
                  <span className="text-left w-full">Cerrar Sesión</span>
                </Button>
              </div>
            </SheetClose>
          </SignedIn>
          <SignedOut>
            <div className="flex flex-col gap-1">
              <SheetClose asChild>
                <Button variant="outline" onClick={onCreateAccountClick}>
                  <UserPlusIcon className="mr-2 h-5 w-5" />
                  Crear cuenta
                </Button>
              </SheetClose>
              <SheetClose asChild>
                <RedirectButton className="w-full" href="/sign_in">
                  <LogInIcon className="mr-2 h-6 w-6" />
                  Iniciar sesión
                </RedirectButton>
              </SheetClose>
            </div>
          </SignedOut>
        </ul>
      </SheetContent>
    </Sheet>
  );
};

export default NavigationSidebar;
