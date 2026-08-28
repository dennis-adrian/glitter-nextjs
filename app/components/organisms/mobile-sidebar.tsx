"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";

import { useClerk, useUser } from "@clerk/nextjs";

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
import {
  // BookImageIcon, // used by the commented-out festival items
  BoxesIcon,
  Building2Icon,
  CalendarCheck2Icon,
  CalendarIcon,
  CircleAlertIcon,
  HomeIcon,
  ImagesIcon,
  LogOutIcon,
  MicIcon,
  PackageIcon,
  QrCodeIcon,
  ReceiptTextIcon,
  ScanLineIcon,
  ScrollTextIcon,
  ShirtIcon,
  // StickerIcon, // used by the commented-out festival items
  StoreIcon,
  TagsIcon,
  TicketIcon,
  ToggleLeftIcon,
  UsersIcon,
  SparklesIcon,
} from "lucide-react";
import { NavbarProfile } from "@/app/api/users/definitions";

type MobileSidebarItemProps = {
  href: string;
  children: React.ReactNode;
};

const MobileSidebarItem = ({ href, children }: MobileSidebarItemProps) => {
  return (
    <li>
      <SheetClose
        asChild
        className="flex w-full rounded-xl p-2 text-left text-brand-neutral transition-colors hover:bg-brand-lavender hover:text-brand-primary"
      >
        <Link href={href}>{children}</Link>
      </SheetClose>
    </li>
  );
};

type MobileSidebarProps = {
  profile?: NavbarProfile | null;
  /** Null when the entry is switched off, gated, or nothing is published. */
  programsHref?: string | null;
  children: React.ReactNode;
};

const MobileSidebar = ({
  children,
  profile,
  programsHref,
}: MobileSidebarProps) => {
  const { signOut } = useClerk();
  const { isSignedIn } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const canViewSupplies = profile?.status === "verified";

  if (pathname.includes("festivals") && pathname.includes("registration"))
    return null;

  return (
    <Sheet>
      <SheetTrigger
        aria-label="Open navigation menu"
        className="cursor-default rounded-full border-brand-border text-brand-ink hover:bg-brand-lavender hover:text-brand-primary"
        variant="outline"
        size="icon"
      >
        {children}
      </SheetTrigger>
      <SheetContent
        side="left"
        className="flex flex-col border-brand-border bg-brand-elevated"
      >
        <SheetHeader>
          <SheetTitle>
            <SheetClose>
              <Link href="/">
                <Image
                  src="/img/logo/glitter-logo-full-primary-1696x739.png"
                  alt="Productora Glitter"
                  width={1696}
                  height={739}
                  className="h-auto w-[120px] object-contain"
                />
              </Link>
            </SheetClose>
          </SheetTitle>
        </SheetHeader>
        <Separator className="my-2" />
        <ul className="flex flex-col flex-1 overflow-y-auto">
          <MobileSidebarItem href="/">
            <HomeIcon className="mr-2 h-6 w-6" />
            Inicio
          </MobileSidebarItem>
          <MobileSidebarItem href="/next_event">
            <CalendarCheck2Icon className="mr-2 h-6 w-6" />
            Próximo Evento
          </MobileSidebarItem>
          {canViewSupplies ? (
            <li>
              <h4 className="flex items-center p-2 text-lg">
                <StoreIcon className="mr-2 h-6 w-6" />
                Tiendita
              </h4>
              <ul className="ml-4">
                <MobileSidebarItem href="/merch">
                  <StoreIcon className="mr-2 h-6 w-6" />
                  Merch
                </MobileSidebarItem>
                <MobileSidebarItem href="/supplies">
                  <PackageIcon className="mr-2 h-6 w-6" />
                  Mercadito de Insumos
                </MobileSidebarItem>
              </ul>
            </li>
          ) : (
            <MobileSidebarItem href="/merch">
              <StoreIcon className="mr-2 h-6 w-6" />
              Tiendita
            </MobileSidebarItem>
          )}
          {/* Semana Glitter takes this slot for the launch. Restore these
              when the festival content is the priority again. */}
          {/* <MobileSidebarItem href="/festivals">
            <BookImageIcon className="mr-2 h-6 w-6" />
            Festivales
          </MobileSidebarItem>
          <div className="ml-4">
            <MobileSidebarItem href="/festivals/festicker">
              <StickerIcon className="mr-2 h-6 w-6" />
              Festicker
            </MobileSidebarItem>
          </div>
          <MobileSidebarItem href="/festivals/categories">
            <BoxesIcon className="w-6 h-6 mr-2" />
            Categorías Glitter
          </MobileSidebarItem> */}

          {programsHref ? (
            <MobileSidebarItem href={programsHref}>
              <SparklesIcon className="mr-2 h-6 w-6" />
              Semana Glitter
              {/* Sits beside the label rather than at the row's far edge: these
                  rows are full-width, so a corner dot would float alone in
                  empty space and read as unrelated to the item. */}
              <span
                aria-hidden="true"
                className="ml-2 mt-1 size-2 shrink-0 self-start rounded-full bg-primary"
              />
              <span className="sr-only">(nuevo)</span>
            </MobileSidebarItem>
          ) : null}
          {profile && profile.role === "festival_admin" && (
            <>
              <MobileSidebarItem href="/dashboard/infractions?limit=25&offset=0">
                <CircleAlertIcon className="mr-2 h-6 w-6" />
                Infracciones
              </MobileSidebarItem>
              <MobileSidebarItem href="/dashboard/banners">
                <ImagesIcon className="mr-2 h-6 w-6" />
                Carrusel inicio
              </MobileSidebarItem>
              <MobileSidebarItem href="/dashboard/landing">
                <ImagesIcon className="mr-2 h-6 w-6" />
                Contenido de inicio
              </MobileSidebarItem>
              <li>
                <h4 className="flex items-center p-2 text-lg">
                  <CalendarIcon className="mr-2 h-6 w-6" />
                  Programas
                </h4>
                <ul className="ml-4">
                  <MobileSidebarItem href="/dashboard/programs">
                    <CalendarCheck2Icon className="mr-2 h-6 w-6" />
                    Programas
                  </MobileSidebarItem>
                  <MobileSidebarItem href="/dashboard/programs/check-in">
                    <ScanLineIcon className="mr-2 h-6 w-6" />
                    Registrar ingresos
                  </MobileSidebarItem>
                  <MobileSidebarItem href="/dashboard/programs/enrollments">
                    <UsersIcon className="mr-2 h-6 w-6" />
                    Inscripciones
                  </MobileSidebarItem>
                  <MobileSidebarItem href="/dashboard/programs/purchases">
                    <ReceiptTextIcon className="mr-2 h-6 w-6" />
                    Pagos por revisar
                  </MobileSidebarItem>
                  <MobileSidebarItem href="/dashboard/programs/promo-codes">
                    <TicketIcon className="mr-2 h-6 w-6" />
                    Códigos de programas
                  </MobileSidebarItem>
                  <MobileSidebarItem href="/dashboard/programs/speakers">
                    <MicIcon className="mr-2 h-6 w-6" />
                    Expositores
                  </MobileSidebarItem>
                  <MobileSidebarItem href="/dashboard/programs/venues">
                    <Building2Icon className="mr-2 h-6 w-6" />
                    Lugares
                  </MobileSidebarItem>
                </ul>
              </li>
            </>
          )}
          {profile && profile.role === "admin" && (
            <>
              <MobileSidebarItem href="/dashboard">
                <h4 className="text-lg">Dashboard</h4>
              </MobileSidebarItem>
              <div className="ml-4">
                <MobileSidebarItem href="/dashboard/users?limit=10&offset=0&includeAdmins=false&sort=updatedAt&direction=desc">
                  <UsersIcon className="mr-2 h-6 w-6" />
                  Participantes
                </MobileSidebarItem>
                <MobileSidebarItem href="/dashboard/infractions?limit=25&offset=0">
                  <CircleAlertIcon className="mr-2 h-6 w-6" />
                  Infracciones
                </MobileSidebarItem>
                <MobileSidebarItem href="/dashboard/profile_requests?limit=10&offset=0&includeAdmins=false&sort=updatedAt&direction=desc&profileCompletion=complete">
                  <UsersIcon className="mr-2 h-6 w-6" />
                  Solicitudes de perfil
                </MobileSidebarItem>
                <li>
                  <h4 className="flex items-center p-2 text-lg">
                    <StoreIcon className="mr-2 h-6 w-6" />
                    Tienda
                  </h4>
                  <ul className="ml-4">
                    <MobileSidebarItem href="/dashboard/store/payments">
                      <ReceiptTextIcon className="mr-2 h-6 w-6" />
                      Pagos
                    </MobileSidebarItem>
                    <MobileSidebarItem href="/dashboard/store/orders">
                      <ShirtIcon className="mr-2 h-6 w-6" />
                      Pedidos
                    </MobileSidebarItem>
                    <MobileSidebarItem href="/dashboard/store/products">
                      <PackageIcon className="mr-2 h-6 w-6" />
                      Productos
                    </MobileSidebarItem>
                  </ul>
                </li>
                <MobileSidebarItem href="/dashboard/festivals">
                  <CalendarIcon className="mr-2 h-6 w-6" />
                  Festivales
                </MobileSidebarItem>
                <MobileSidebarItem href="/dashboard/categories">
                  <BoxesIcon className="mr-2 h-6 w-6" />
                  Categorías
                </MobileSidebarItem>
                <MobileSidebarItem href="/dashboard/terms">
                  <ScrollTextIcon className="mr-2 h-6 w-6" />
                  Términos y condiciones
                </MobileSidebarItem>
                <MobileSidebarItem href="/dashboard/tags">
                  <TagsIcon className="mr-2 h-6 w-6" />
                  Etiquetas
                </MobileSidebarItem>
                <MobileSidebarItem href="/dashboard/external_participants">
                  <Building2Icon className="mr-2 h-6 w-6" />
                  Participantes externos
                </MobileSidebarItem>
                <MobileSidebarItem href="/dashboard/discount_codes">
                  <TicketIcon className="mr-2 h-6 w-6" />
                  Códigos de descuento
                </MobileSidebarItem>
                <MobileSidebarItem href="/dashboard/qr_codes">
                  <QrCodeIcon className="mr-2 h-6 w-6" />
                  Códigos QR
                </MobileSidebarItem>
                <MobileSidebarItem href="/dashboard/live-acts">
                  <MicIcon className="mr-2 h-6 w-6" />
                  Presentaciones en vivo
                </MobileSidebarItem>
                <MobileSidebarItem href="/dashboard/banners">
                  <ImagesIcon className="mr-2 h-6 w-6" />
                  Carrusel inicio
                </MobileSidebarItem>
                <MobileSidebarItem href="/dashboard/landing">
                  <ImagesIcon className="mr-2 h-6 w-6" />
                  Contenido de inicio
                </MobileSidebarItem>
                <li>
                  <h4 className="flex items-center p-2 text-lg">
                    <CalendarIcon className="mr-2 h-6 w-6" />
                    Programas
                  </h4>
                  <ul className="ml-4">
                    <MobileSidebarItem href="/dashboard/programs">
                      <CalendarCheck2Icon className="mr-2 h-6 w-6" />
                      Programas
                    </MobileSidebarItem>
                    <MobileSidebarItem href="/dashboard/programs/check-in">
                      <ScanLineIcon className="mr-2 h-6 w-6" />
                      Registrar ingresos
                    </MobileSidebarItem>
                    <MobileSidebarItem href="/dashboard/programs/enrollments">
                      <UsersIcon className="mr-2 h-6 w-6" />
                      Inscripciones
                    </MobileSidebarItem>
                    <MobileSidebarItem href="/dashboard/programs/purchases">
                      <ReceiptTextIcon className="mr-2 h-6 w-6" />
                      Pagos por revisar
                    </MobileSidebarItem>
                    <MobileSidebarItem href="/dashboard/programs/promo-codes">
                      <TicketIcon className="mr-2 h-6 w-6" />
                      Códigos de programas
                    </MobileSidebarItem>
                    <MobileSidebarItem href="/dashboard/programs/speakers">
                      <MicIcon className="mr-2 h-6 w-6" />
                      Expositores
                    </MobileSidebarItem>
                    <MobileSidebarItem href="/dashboard/programs/venues">
                      <Building2Icon className="mr-2 h-6 w-6" />
                      Lugares
                    </MobileSidebarItem>
                  </ul>
                </li>
                <MobileSidebarItem href="/dashboard/feature_flags">
                  <ToggleLeftIcon className="mr-2 h-6 w-6" />
                  Funcionalidades
                </MobileSidebarItem>
              </div>
            </>
          )}
          {isSignedIn && (
            <>
              <Separator className="my-2" />
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
            </>
          )}
        </ul>
      </SheetContent>
    </Sheet>
  );
};

export default MobileSidebar;
