import {
  BookOpenIcon,
  BoxesIcon,
  Building2Icon,
  CalendarCheck2Icon,
  CalendarIcon,
  CircleAlertIcon,
  ClipboardListIcon,
  CoinsIcon,
  FileTextIcon,
  HomeIcon,
  ImagesIcon,
  LayoutDashboardIcon,
  LibraryBigIcon,
  ListIcon,
  MailXIcon,
  MenuIcon,
  MicIcon,
  PackageIcon,
  QrCodeIcon,
  ReceiptTextIcon,
  ScanLineIcon,
  ScrollTextIcon,
  ShoppingBagIcon,
  StoreIcon,
  TagsIcon,
  TicketIcon,
  ToggleLeftIcon,
  UserCheckIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import type { BaseProfile } from "@/app/api/users/definitions";

/**
 * The one description of where Glitter's navigation leads. The desktop
 * sidebar, the installed app's tab bar, the mobile menu sheet and the "Más"
 * page all render from it, so an entry added or gated here shows up — or
 * disappears — everywhere at once.
 */

/** Only what navigation needs to know about whoever is signed in. */
export type NavViewer = Pick<BaseProfile, "role" | "status">;

export type NavLink = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Marks a destination that is new to the viewer, with a dot. */
  isNew?: boolean;
  /**
   * Path prefixes that also count as being "on" this entry, beyond its own
   * href. A tab is lit for every page reached through it, not only its root.
   */
  activePrefixes?: string[];
};

export type NavSection = {
  key: string;
  label: string;
  icon: LucideIcon;
  items: NavLink[];
};

export type NavGroup = {
  key: "explore" | "mine" | "admin";
  label: string;
  items: NavLink[];
  /** Collapsible sub-lists; only the admin group has them. */
  sections?: NavSection[];
};

export type AppNavigationInput = {
  /** Null for a signed-out visitor, or a session whose profile is not ready. */
  viewer: NavViewer | null;
  /** Null when the programs entry is switched off, gated, or empty. */
  programsHref?: string | null;
  blogEnabled?: boolean;
  creditsEnabled?: boolean;
};

export type AppNavigation = {
  /** The installed app's bottom bar: three destinations and "Más". */
  tabs: NavLink[];
  /** Grouped entries for the sidebar, the mobile sheet and "Más". */
  groups: NavGroup[];
};

export const PORTAL_HREF = "/portal";
/** The festival in progress, or the archive when none is. */
export const FESTIVALS_HREF = "/festivals";
export const MORE_MENU_HREF = "/menu";

function isVerified(viewer: NavViewer | null) {
  return viewer?.status === "verified";
}

/**
 * Who may open the participant's own records (credits, history). Mirrors
 * `PARTICIPANT_READ_ONLY_ROUTE_STATUSES`, which those pages pass to
 * `protectRoute`; anyone else would be sent straight to their profile.
 */
function hasParticipantRecords(viewer: NavViewer | null) {
  return viewer?.status === "verified" || viewer?.status === "paused";
}

function isStaff(viewer: NavViewer | null) {
  return viewer?.role === "admin" || viewer?.role === "festival_admin";
}

/**
 * A verified participant's festival space. Anyone else signed in — a profile
 * still pending, paused or rejected — gets the public festival instead.
 */
function festivalLink(viewer: NavViewer | null): NavLink {
  if (isVerified(viewer)) {
    return {
      key: "participations",
      label: "Participaciones",
      href: "/my_participations",
      icon: ClipboardListIcon,
      activePrefixes: ["/my_participations", "/profiles/"],
    };
  }

  return {
    key: "festivals",
    label: "Festivales",
    href: FESTIVALS_HREF,
    icon: CalendarIcon,
    activePrefixes: ["/next_event"],
  };
}

const STORE_PREFIXES = ["/merch", "/supplies", "/store", "/checkout"];

function storeLink(): NavLink {
  return {
    key: "store",
    label: "Tiendita",
    href: "/merch",
    icon: StoreIcon,
    activePrefixes: STORE_PREFIXES,
  };
}

function programsLink(programsHref: string): NavLink {
  return {
    key: "programs",
    label: "Charlas y Talleres",
    href: programsHref,
    icon: LibraryBigIcon,
    isNew: true,
    activePrefixes: ["/programs"],
  };
}

const blogLink: NavLink = {
  key: "blog",
  label: "Blog",
  href: "/blog",
  icon: BookOpenIcon,
  activePrefixes: ["/blog"],
};

/**
 * What a signed-out visitor is offered: the public site, unchanged from the
 * navbar it had before the app shell.
 */
export function buildPublicNavigation({
  programsHref = null,
  blogEnabled = false,
}: Omit<AppNavigationInput, "viewer" | "creditsEnabled">): NavLink[] {
  return [
    { key: "home", label: "Inicio", href: "/", icon: HomeIcon },
    {
      key: "next-event",
      label: "Próximo Evento",
      href: "/next_event",
      icon: CalendarCheck2Icon,
    },
    ...(blogEnabled ? [blogLink] : []),
    storeLink(),
    ...(programsHref ? [programsLink(programsHref)] : []),
  ];
}

const PROGRAMS_ADMIN: NavSection = {
  key: "admin-programs",
  label: "Programas",
  icon: CalendarIcon,
  items: [
    {
      key: "admin-programs-list",
      label: "Programas",
      href: "/dashboard/programs",
      icon: CalendarCheck2Icon,
    },
    {
      key: "admin-programs-check-in",
      label: "Registrar ingresos",
      href: "/dashboard/programs/check-in",
      icon: ScanLineIcon,
    },
    {
      key: "admin-programs-enrollments",
      label: "Inscripciones",
      href: "/dashboard/programs/enrollments",
      icon: UsersIcon,
    },
    {
      key: "admin-programs-purchases",
      label: "Pagos por revisar",
      href: "/dashboard/programs/purchases",
      icon: ReceiptTextIcon,
    },
    {
      key: "admin-programs-promo-codes",
      label: "Códigos de programas",
      href: "/dashboard/programs/promo-codes",
      icon: TicketIcon,
    },
    {
      key: "admin-programs-speakers",
      label: "Expositores",
      href: "/dashboard/programs/speakers",
      icon: MicIcon,
    },
    {
      key: "admin-programs-venues",
      label: "Lugares",
      href: "/dashboard/programs/venues",
      icon: Building2Icon,
    },
  ],
};

const festivalsAdminLink: NavLink = {
  key: "admin-festivals",
  label: "Festivales",
  href: "/dashboard/festivals",
  icon: CalendarIcon,
};

const infractionsAdminLink: NavLink = {
  key: "admin-infractions",
  label: "Infracciones",
  href: "/dashboard/infractions?limit=25&offset=0",
  icon: CircleAlertIcon,
};

const bannersAdminLink: NavLink = {
  key: "admin-banners",
  label: "Carrusel inicio",
  href: "/dashboard/banners",
  icon: ImagesIcon,
};

const landingAdminLink: NavLink = {
  key: "admin-landing",
  label: "Contenido de inicio",
  href: "/dashboard/landing",
  icon: FileTextIcon,
};

/** Festival admins see only what `requireAdminOrFestivalAdmin` lets them open. */
const FESTIVAL_ADMIN: NavSection = {
  key: "admin-festival",
  label: "Gestión",
  icon: LayoutDashboardIcon,
  items: [
    festivalsAdminLink,
    infractionsAdminLink,
    bannersAdminLink,
    landingAdminLink,
  ],
};

const ADMIN: NavSection = {
  key: "admin-dashboard",
  label: "Dashboard",
  icon: LayoutDashboardIcon,
  items: [
    {
      key: "admin-overview",
      label: "Resumen",
      href: "/dashboard",
      icon: LayoutDashboardIcon,
    },
    {
      key: "admin-users",
      label: "Participantes",
      href: "/dashboard/users?limit=10&offset=0&includeAdmins=false&sort=updatedAt&direction=desc",
      icon: UsersIcon,
    },
    infractionsAdminLink,
    {
      key: "admin-profile-requests",
      label: "Solicitudes de perfil",
      href: "/dashboard/profile_requests?limit=10&offset=0&includeAdmins=false&sort=updatedAt&direction=desc&profileCompletion=complete",
      icon: UserCheckIcon,
    },
    {
      key: "admin-credits",
      label: "Créditos",
      href: "/dashboard/credits",
      icon: CoinsIcon,
    },
    festivalsAdminLink,
    {
      key: "admin-store",
      label: "Tienda",
      href: "/dashboard/store/analytics",
      icon: ShoppingBagIcon,
    },
    {
      key: "admin-categories",
      label: "Categorías",
      href: "/dashboard/categories",
      icon: BoxesIcon,
    },
    {
      key: "admin-terms",
      label: "Términos y condiciones",
      href: "/dashboard/terms",
      icon: ScrollTextIcon,
    },
    {
      key: "admin-tags",
      label: "Etiquetas",
      href: "/dashboard/tags",
      icon: TagsIcon,
    },
    {
      key: "admin-external-participants",
      label: "Participantes externos",
      href: "/dashboard/external_participants",
      icon: Building2Icon,
    },
    {
      key: "admin-discount-codes",
      label: "Códigos de descuento",
      href: "/dashboard/discount_codes",
      icon: TicketIcon,
    },
    {
      key: "admin-qr-codes",
      label: "Códigos QR",
      href: "/dashboard/qr_codes",
      icon: QrCodeIcon,
    },
    {
      key: "admin-live-acts",
      label: "Presentaciones en vivo",
      href: "/dashboard/live-acts",
      icon: MicIcon,
    },
    bannersAdminLink,
    landingAdminLink,
    {
      key: "admin-feature-flags",
      label: "Funcionalidades",
      href: "/dashboard/feature_flags",
      icon: ToggleLeftIcon,
    },
    {
      key: "admin-emails",
      label: "Correos bloqueados",
      href: "/dashboard/emails",
      icon: MailXIcon,
    },
    {
      key: "admin-blog",
      label: "Blog",
      href: "/dashboard/blog",
      icon: BookOpenIcon,
    },
  ],
};

function adminSections(viewer: NavViewer | null): NavSection[] {
  if (viewer?.role === "admin") return [ADMIN, PROGRAMS_ADMIN];
  if (viewer?.role === "festival_admin")
    return [FESTIVAL_ADMIN, PROGRAMS_ADMIN];
  return [];
}

/** Pages a signed-in person reaches through "Más", so its tab stays lit there. */
const MORE_PREFIXES = [
  MORE_MENU_HREF,
  "/my_orders",
  "/my_credits",
  "/my_history",
  "/my_programs",
  "/my_profile",
  "/my_notifications",
  "/orders/",
  "/programs",
  "/blog",
  "/dashboard",
];

/** Navigation for someone signed in. */
export function buildAppNavigation({
  viewer,
  programsHref = null,
  blogEnabled = false,
  creditsEnabled = false,
}: AppNavigationInput): AppNavigation {
  const festival = festivalLink(viewer);
  const store = storeLink();

  const explore: NavLink[] = [
    festival,
    store,
    ...(isVerified(viewer)
      ? [
          {
            key: "supplies",
            label: "Mercadito de Insumos",
            href: "/supplies",
            icon: PackageIcon,
          },
        ]
      : []),
    ...(programsHref ? [programsLink(programsHref)] : []),
    ...(blogEnabled ? [blogLink] : []),
  ];

  const home: NavLink = {
    key: "home",
    label: "Inicio",
    href: PORTAL_HREF,
    icon: HomeIcon,
  };

  const mine: NavLink[] = [
    home,
    {
      key: "orders",
      label: "Mis pedidos",
      href: "/my_orders",
      icon: ShoppingBagIcon,
    },
    ...(creditsEnabled && hasParticipantRecords(viewer)
      ? [
          {
            key: "credits",
            label: "Mis créditos",
            href: "/my_credits",
            icon: CoinsIcon,
          },
        ]
      : []),
    ...(programsHref
      ? [
          {
            key: "my-programs",
            label: "Mis inscripciones",
            href: "/my_programs",
            icon: TicketIcon,
          },
        ]
      : []),
    ...(hasParticipantRecords(viewer)
      ? [
          {
            key: "history",
            label: "Mi historial",
            href: "/my_history",
            icon: ListIcon,
          },
        ]
      : []),
  ];

  const sections = adminSections(viewer);

  const groups: NavGroup[] = [
    { key: "explore", label: "Explorar", items: explore },
    { key: "mine", label: "Mi espacio", items: mine },
    ...(isStaff(viewer) && sections.length > 0
      ? [
          {
            key: "admin" as const,
            label: "Administración",
            items: [],
            sections,
          },
        ]
      : []),
  ];

  const tabs: NavLink[] = [
    home,
    festival,
    store,
    {
      key: "more",
      label: "Más",
      href: MORE_MENU_HREF,
      icon: MenuIcon,
      activePrefixes: MORE_PREFIXES,
    },
  ];

  return { tabs, groups };
}

/**
 * Whether a link is the current page. A plain href matches itself and what
 * sits under it; `activePrefixes` widen that, and "/" only ever matches the
 * root exactly so it does not light up for every page.
 */
export function isNavLinkActive(link: NavLink, pathname: string): boolean {
  const href = link.href.split("?")[0];
  const prefixes = [href, ...(link.activePrefixes ?? [])];

  return prefixes.some((prefix) => {
    if (prefix === "/") return pathname === "/";
    if (pathname === prefix) return true;
    const base = prefix.endsWith("/") ? prefix : `${prefix}/`;
    return pathname.startsWith(base);
  });
}

/**
 * The tab to light for a page. "Inicio" owns the root (which redirects a
 * signed-in person to the portal) and the portal; a destination tab owns the
 * pages reached through it; "Más" only takes what no destination tab did.
 */
export function activeTabKey(tabs: NavLink[], pathname: string): string | null {
  const home = tabs.find((tab) => tab.key === "home");
  if (home && (pathname === "/" || isNavLinkActive(home, pathname))) {
    return "home";
  }

  const destination = tabs.find(
    (tab) =>
      tab.key !== "home" &&
      tab.key !== "more" &&
      isNavLinkActive(tab, pathname),
  );
  if (destination) return destination.key;

  const more = tabs.find((tab) => tab.key === "more");
  if (more && isNavLinkActive(more, pathname)) return "more";

  return null;
}

/**
 * Steps where leaving by accident costs the person their progress: paying,
 * picking a stand, checking out. The installed app's tab bar steps aside on
 * them, the way native apps hide theirs during a checkout.
 */
export function isFocusedFlowPage(pathname: string): boolean {
  return (
    pathname.startsWith("/checkout") ||
    /\/reservations\/new(\/|$)/.test(pathname) ||
    /^\/(orders|profiles)\/.+\/(pay|payment|payments)$/.test(pathname)
  );
}
