"use client";

import Link from "next/link";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuListItem,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/app/components/ui/navigation-menu";
import {
  // BookImageIcon, // used by the commented-out festival items
  // BoxesIcon, // used by the commented-out festival items
  CalendarCheck2Icon,
  CalendarIcon,
  CircleAlertIcon,
  HomeIcon,
  ImagesIcon,
  SparklesIcon,
  LayoutDashboardIcon,
  StoreIcon,
} from "lucide-react";
import { NavbarProfile } from "../../api/users/definitions";
import { usePathname } from "next/navigation";
import { cn } from "@/app/lib/utils";
import { isNoNavigationPage } from "@/app/lib/utils";

const NavbarNavigationMenu = ({
  profile,
  programsHref,
}: {
  profile?: NavbarProfile | null;
  /** Null when the entry is switched off, gated, or nothing is published. */
  programsHref?: string | null;
}) => {
  const pathname = usePathname();
  const canViewSupplies = profile?.status === "verified";

  if (isNoNavigationPage(pathname)) {
    return null;
  }

  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
            <Link href="/">
              <div className="flex items-center">
                <HomeIcon className="w-4 h-4 mr-1" />
                Inicio
              </div>
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
            <Link href="/next_event">
              <div className="flex items-center">
                <CalendarCheck2Icon className="w-4 h-4 mr-1" />
                Próximo Evento
              </div>
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
        {canViewSupplies ? (
          <NavigationMenuItem>
            <NavigationMenuTrigger>
              <div className="flex items-center">
                <StoreIcon className="w-4 h-4 mr-1" />
                Tiendita
              </div>
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className="grid w-100 gap-3 p-4 md:w-125 md:grid-cols-2">
                <NavigationMenuListItem title="Merch" href="/merch">
                  Mercha oficial de nuestros festivales
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Mercadito de Insumos"
                  href="/supplies"
                >
                  Productos útiles para mejorar la presentación de tu stand
                </NavigationMenuListItem>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
        ) : (
          <NavigationMenuItem>
            <NavigationMenuLink
              asChild
              className={navigationMenuTriggerStyle()}
            >
              <Link href="/merch">
                <div className="flex items-center">
                  <StoreIcon className="w-4 h-4 mr-1" />
                  Tiendita
                </div>
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>
        )}
        {/* Semana Glitter takes this slot for the launch. Restore these two
            when the festival content is the priority again. */}
        {/* <NavigationMenuItem>
          <NavigationMenuTrigger>
            <div className="flex items-center">
              <BookImageIcon className="w-4 h-4 mr-1" />
              Festivales
            </div>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-100 gap-3 p-4 md:w-125 md:grid-cols-2 lg:w-150">
              <NavigationMenuListItem
                title="Festicker"
                href="/festivals/festicker"
              >
                Un festival diseñado para impulsar la cultura del sticker
              </NavigationMenuListItem>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
            <Link href="/festivals/categories">
              <div className="flex items-center">
                <BoxesIcon className="w-4 h-4 mr-1" />
                Categorías Glitter
              </div>
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem> */}

        {programsHref ? (
          <NavigationMenuItem>
            <NavigationMenuLink
              asChild
              className={cn(navigationMenuTriggerStyle(), "relative")}
            >
              <Link href={programsHref}>
                <div className="flex items-center">
                  <SparklesIcon className="w-4 h-4 mr-1" />
                  Semana Glitter
                </div>
                {/* Absolutely positioned against the trigger itself, so it sits
                    in the item's own top-right corner and contributes no width.
                    Nothing above clips it — the only `overflow-hidden` in this
                    primitive is on the dropdown viewport. */}
                <span
                  aria-hidden="true"
                  className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary"
                />
                <span className="sr-only">(nuevo)</span>
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>
        ) : null}
        {profile && profile.role === "festival_admin" && (
          <>
            <NavigationMenuItem>
              <NavigationMenuLink
                asChild
                className={navigationMenuTriggerStyle()}
              >
                <Link href="/dashboard/infractions?limit=25&offset=0">
                  <div className="flex items-center">
                    <CircleAlertIcon className="w-4 h-4 mr-1" />
                    Infracciones
                  </div>
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink
                asChild
                className={navigationMenuTriggerStyle()}
              >
                <Link href="/dashboard/banners">
                  <div className="flex items-center">
                    <ImagesIcon className="w-4 h-4 mr-1" />
                    Carrusel inicio
                  </div>
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            {/* Programs are managed by both admin tiers, matching
                `requireAdminOrFestivalAdmin` on every program action. */}
            <NavigationMenuItem>
              <NavigationMenuLink
                asChild
                className={navigationMenuTriggerStyle()}
              >
                <Link href="/dashboard/programs">
                  <div className="flex items-center">
                    <CalendarIcon className="w-4 h-4 mr-1" />
                    Programas
                  </div>
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </>
        )}
        {profile && profile.role === "admin" && (
          <NavigationMenuItem>
            <NavigationMenuTrigger>
              <div className="flex items-center">
                <LayoutDashboardIcon className="w-4 h-4 mr-1" />
                Dashboard
              </div>
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className="grid w-100 gap-3 p-4 md:w-125 md:grid-cols-2 lg:w-150">
                <NavigationMenuListItem
                  title="Participantes"
                  href="/dashboard/users?limit=10&offset=0&includeAdmins=false&sort=updatedAt&direction=desc"
                >
                  Participantes activos, pausados y vetados
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Infracciones"
                  href="/dashboard/infractions?limit=25&offset=0"
                >
                  Gestión global de infracciones y sanciones
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Solicitudes de perfil"
                  href="/dashboard/profile_requests?limit=10&offset=0&includeAdmins=false&sort=updatedAt&direction=desc&profileCompletion=complete"
                >
                  Perfiles pendientes o rechazados
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Festivales"
                  href="/dashboard/festivals"
                >
                  Festivales que han sido organizados por Glitter
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Tienda"
                  href="/dashboard/store/analytics"
                >
                  Gestiona pagos, pedidos y productos de la tienda
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Programas"
                  href="/dashboard/programs"
                >
                  Charlas y talleres, con sus horarios y expositores
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Pagos por revisar"
                  href="/dashboard/programs/purchases"
                >
                  Comprobantes de inscripciones esperando aprobación
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Códigos de programas"
                  href="/dashboard/programs/promo-codes"
                >
                  Promociones y atribución para artistas e influencers
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Subcategorías"
                  href="/dashboard/subcategories"
                >
                  Subcategorías
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Etiquetas"
                  href="/dashboard/tags"
                >
                  Etiquetas para los usuarios
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Participantes externos"
                  href="/dashboard/external_participants"
                >
                  Instituciones, auspiciantes y aliados sin cuenta
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Códigos de descuento"
                  href="/dashboard/discount_codes"
                >
                  Códigos de descuento para reservas
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Códigos QR"
                  href="/dashboard/qr_codes"
                >
                  Códigos QR para pagos por monto
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Presentaciones en vivo"
                  href="/dashboard/live-acts"
                >
                  Postulaciones de actos en vivo
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Carrusel inicio"
                  href="/dashboard/banners"
                >
                  Banners de la página de inicio y del portal
                </NavigationMenuListItem>
                <NavigationMenuListItem
                  title="Funcionalidades"
                  href="/dashboard/feature_flags"
                >
                  Activa o esconde funcionalidades y da acceso anticipado
                </NavigationMenuListItem>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
        )}
      </NavigationMenuList>
    </NavigationMenu>
  );
};

export default NavbarNavigationMenu;
