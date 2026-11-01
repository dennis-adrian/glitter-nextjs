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
import {
  festivalSectionHref,
  visibleFestivalSections,
} from "@/app/components/festivals/festival-sections";
import type { FestivalBase } from "@/app/lib/festivals/definitions";

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
  /** One line under the label, where a menu has room for it. */
  description?: string;
  /** Lit only on its own page, not on the pages under it (staff Inicio). */
  exact?: boolean;
  /**
   * Destinations inside this entry, like the two stores of Tiendita. The
   * entry is then a heading over them, and the tab bar opens a sheet to pick
   * one instead of navigating.
   */
  children?: NavLink[];
};

export type NavSection = {
  key: string;
  label: string;
  icon: LucideIcon;
  items: NavLink[];
  /** Open from the start, like the festival in progress for staff. */
  defaultOpen?: boolean;
  /**
   * Where the collapsed rail's single icon leads; its first page otherwise.
   * The festival's icon opens the festival, not the list of all festivals.
   */
  href?: string;
};

export type NavGroup = {
  key:
    | "explore"
    | "mine"
    | "admin"
    | "home"
    | "festival"
    | "operation"
    | "people"
    | "sections"
    | "account";
  /** Empty for a group that needs no heading, like staff's Inicio. */
  label: string;
  items: NavLink[];
  /** Collapsible sub-lists, for staff. */
  sections?: NavSection[];
};

/** The festival in progress, as staff navigation needs it. */
export type StaffFestival = {
  id: number;
  name: string;
  status: FestivalBase["status"];
};

export type AppNavigationInput = {
  /** Null for a signed-out visitor, or a session whose profile is not ready. */
  viewer: NavViewer | null;
  /** Null when the programs entry is switched off, gated, or empty. */
  programsHref?: string | null;
  blogEnabled?: boolean;
  creditsEnabled?: boolean;
  /** The supplies market is open; it is only ever offered to verified profiles. */
  suppliesOpen?: boolean;
  /** For staff: the festival in progress, whose sections lead the sidebar. */
  activeFestival?: StaffFestival | null;
};

export type AppNavigation = {
  /** The installed app's bottom bar: three destinations and "Más". */
  tabs: NavLink[];
  /** Grouped entries for the sidebar, the mobile sheet and "Más". */
  groups: NavGroup[];
  /** Staff's own, shorter "Más"; participants' "Más" renders `groups`. */
  more?: NavGroup[];
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

/**
 * Tiendita. Most people have one store, so the entry is the merch store.
 * When the supplies market is open to this viewer it holds both stores, and
 * the tab bar asks which one.
 */
function storeLink(withSupplies = false): NavLink {
  const store: NavLink = {
    key: "store",
    label: "Tiendita",
    href: "/merch",
    icon: StoreIcon,
    activePrefixes: STORE_PREFIXES,
  };
  if (!withSupplies) return store;
  return {
    ...store,
    children: [
      {
        key: "store-merch",
        label: "Merch",
        description: "Colecciones, combos y productos de Glitter",
        href: "/merch",
        icon: StoreIcon,
        activePrefixes: ["/merch", "/store", "/checkout"],
      },
      {
        key: "store-supplies",
        label: "Mercadito de Insumos",
        description: "Insumos y alquileres para tu stand",
        href: "/supplies",
        icon: PackageIcon,
        activePrefixes: ["/supplies"],
      },
    ],
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
}: Omit<
  AppNavigationInput,
  "viewer" | "creditsEnabled" | "suppliesOpen"
>): NavLink[] {
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

const STAFF_HOME_HREF = "/dashboard";

/** An admin page by its key, so each entry is described once. */
function adminLink(key: string): NavLink {
  const link = [...ADMIN.items, ...FESTIVAL_ADMIN.items].find(
    (item) => item.key === key,
  );
  if (!link) throw new Error(`Unknown admin link: ${key}`);
  return link;
}

/** Admin's catalogue and settings pages: one screen of their own. */
const SETTINGS_KEYS = [
  "admin-categories",
  "admin-terms",
  "admin-tags",
  "admin-discount-codes",
  "admin-qr-codes",
  "admin-live-acts",
  "admin-feature-flags",
  "admin-emails",
  "admin-blog",
  "admin-banners",
  "admin-landing",
];

const SETTINGS_SECTION: NavSection = {
  key: "admin-settings",
  label: "Configuración",
  icon: ToggleLeftIcon,
  items: SETTINGS_KEYS.map(adminLink),
};

/** What admins work on day to day besides the festival. */
const OPERATION_KEYS = [
  "admin-store",
  "admin-users",
  "admin-profile-requests",
  "admin-infractions",
  "admin-credits",
  "admin-external-participants",
];

/** The few pages a festival admin may open besides festivals and programs. */
const FESTIVAL_ADMIN_KEYS = ["admin-infractions", "admin-banners", "admin-landing"];

/** The staff screens "Más" opens for a whole section. */
export const STAFF_MENU_SECTIONS = {
  programas: PROGRAMS_ADMIN,
  configuracion: SETTINGS_SECTION,
} as const;

export type StaffMenuSection = keyof typeof STAFF_MENU_SECTIONS;

/** The section a staff member may open at /menu/{slug}, or null. */
export function staffMenuSection(
  viewer: NavViewer | null,
  slug: string,
): NavSection | null {
  if (!isStaff(viewer)) return null;
  if (slug === "programas") return PROGRAMS_ADMIN;
  if (slug === "configuracion" && viewer?.role === "admin") {
    return SETTINGS_SECTION;
  }
  return null;
}

/** The festival in progress and its admin sections, or the festivals list. */
function staffFestivalGroup(festival: StaffFestival | null): NavGroup {
  const allFestivals: NavLink = {
    key: "admin-festivals",
    label: festival ? "Todos los festivales" : "Festivales",
    href: "/dashboard/festivals",
    icon: CalendarIcon,
    exact: true,
  };
  if (!festival) {
    return { key: "festival", label: "Festival", items: [allFestivals] };
  }
  return {
    key: "festival",
    label: "Festival en curso",
    items: [],
    sections: [
      {
        key: "admin-festival-current",
        label: festival.name,
        icon: CalendarIcon,
        defaultOpen: true,
        href: `/dashboard/festivals/${festival.id}`,
        items: [
          allFestivals,
          ...visibleFestivalSections(festival.status).map((section) => ({
            key: `festival-${section.key}`,
            label: section.label,
            href: festivalSectionHref(festival.id, section),
            icon: section.icon,
          })),
        ],
      },
    ],
  };
}

/**
 * Staff navigation. Staff do not take part in festivals, so the participant
 * shell has nothing for them: their Inicio is what waits for review, the
 * festival and the store are tabs of their own (programs for festival
 * admins, who have no store), and "Más" is short, with programs and the
 * settings pages each on one screen of their own.
 */
function buildStaffNavigation(
  viewer: NavViewer | null,
  activeFestival: StaffFestival | null,
): AppNavigation {
  const isAdmin = viewer?.role === "admin";
  const home: NavLink = {
    key: "home",
    label: "Inicio",
    href: STAFF_HOME_HREF,
    icon: HomeIcon,
    exact: true,
  };
  const festivalTab: NavLink = {
    key: "festival",
    label: "Festival",
    href: "/dashboard/festival",
    icon: CalendarIcon,
    activePrefixes: ["/dashboard/festivals"],
  };
  const thirdTab: NavLink = isAdmin
    ? {
        key: "store",
        label: "Tienda",
        href: "/dashboard/store/analytics",
        icon: StoreIcon,
        activePrefixes: ["/dashboard/store"],
      }
    : {
        key: "programs",
        label: "Programas",
        href: "/dashboard/programs",
        icon: LibraryBigIcon,
        activePrefixes: ["/dashboard/programs"],
      };
  const tabs: NavLink[] = [
    home,
    festivalTab,
    thirdTab,
    {
      key: "more",
      label: "Más",
      href: MORE_MENU_HREF,
      icon: MenuIcon,
      // Whatever a destination tab does not own, including their account.
      activePrefixes: [
        MORE_MENU_HREF,
        "/dashboard",
        "/my_profile",
        "/my_orders",
        "/my_notifications",
        "/orders/",
      ],
    },
  ];

  const account: NavGroup = {
    key: "account",
    label: "Mi cuenta",
    items: [
      {
        key: "orders",
        label: "Mis pedidos",
        href: "/my_orders",
        icon: ShoppingBagIcon,
      },
    ],
  };

  const groups: NavGroup[] = [
    { key: "home", label: "", items: [home] },
    staffFestivalGroup(activeFestival),
    isAdmin
      ? {
          key: "operation",
          label: "Operación",
          items: OPERATION_KEYS.map(adminLink),
          sections: [PROGRAMS_ADMIN, SETTINGS_SECTION],
        }
      : {
          key: "operation",
          label: "Gestión",
          items: FESTIVAL_ADMIN_KEYS.map(adminLink),
          sections: [PROGRAMS_ADMIN],
        },
    // Their own pages stay reachable where there is no "Más" tab.
    account,
  ];

  const programsRow: NavLink = {
    key: "menu-programs",
    label: "Programas",
    description: "Programas, ingresos, inscripciones, pagos, códigos, expositores y lugares",
    href: "/menu/programas",
    icon: CalendarCheck2Icon,
  };
  const settingsRow: NavLink = {
    key: "menu-settings",
    label: "Configuración",
    description:
      "Categorías, términos, etiquetas, códigos, QR, presentaciones, funcionalidades, correos, blog, carrusel y contenido de inicio",
    href: "/menu/configuracion",
    icon: ToggleLeftIcon,
  };

  const more: NavGroup[] = isAdmin
    ? [
        {
          key: "people",
          label: "Personas",
          items: OPERATION_KEYS.filter((key) => key !== "admin-store").map(
            adminLink,
          ),
        },
        {
          key: "sections",
          label: "Más secciones",
          items: [programsRow, settingsRow],
        },
        account,
      ]
    : [
        {
          key: "operation",
          label: "Gestión",
          items: FESTIVAL_ADMIN_KEYS.map(adminLink),
        },
        account,
      ];

  return { tabs, groups, more };
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
  suppliesOpen = false,
  activeFestival = null,
}: AppNavigationInput): AppNavigation {
  // Staff do not take part in festivals: they get a shell made for their
  // work instead of the participant one.
  if (isStaff(viewer)) return buildStaffNavigation(viewer, activeFestival);

  const festival = festivalLink(viewer);
  const store = storeLink(suppliesOpen && isVerified(viewer));

  const explore: NavLink[] = [
    festival,
    store,
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

  const groups: NavGroup[] = [
    { key: "explore", label: "Explorar", items: explore },
    { key: "mine", label: "Mi espacio", items: mine },
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
  if (link.exact) return pathname === href;
  const prefixes = [href, ...(link.activePrefixes ?? [])];

  return prefixes.some((prefix) => {
    if (prefix === "/") return pathname === "/";
    if (pathname === prefix) return true;
    const base = prefix.endsWith("/") ? prefix : `${prefix}/`;
    return pathname.startsWith(base);
  });
}

/**
 * The one entry of a list to light: of those that match the page, the most
 * specific. Festival sections nest ("Entradas" and "Verificar entradas"), and
 * only the closer one is the current page.
 */
export function mostSpecificActiveKey(
  links: readonly NavLink[],
  pathname: string,
): string | null {
  let best: { key: string; length: number } | null = null;
  for (const link of links) {
    if (!isNavLinkActive(link, pathname)) continue;
    const length = link.href.split("?")[0].length;
    if (!best || length > best.length) best = { key: link.key, length };
  }
  return best?.key ?? null;
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
