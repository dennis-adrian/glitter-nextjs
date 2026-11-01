import type {
  NavLink,
  NavViewer,
  StaffFestival,
} from "@/app/components/navbar/app-navigation";

/**
 * Where each screen below a tab root sits, for the installed app's top bar:
 * its title and the screen that holds it. The bar shows the title and goes
 * back to the previous screen; when there is none (the app opened on this
 * screen from a notification or a link), it goes to `parent` instead.
 *
 * Titles here are the generic ones. A screen whose title depends on its data
 * (a product, an order number, a festival) names itself with `ScreenTitle`,
 * and the bar shows this one until it does.
 *
 * In a parent, `[param]` is filled from the same segment of the path, and
 * `tab:{key}` stands for that tab's own page for whoever is viewing.
 */
type ScreenDef = {
  title: string;
  parent: string;
  /** A parent of its own for staff whose role sees the section elsewhere. */
  parentFor?: Partial<Record<NonNullable<NavViewer["role"]>, string>>;
  /** The first step of a flow: an X that leaves it, instead of back. */
  close?: boolean;
  /**
   * Never go back through history: the previous screen is a step that is
   * over, like the payment a success page follows.
   */
  toParent?: boolean;
};

const MENU = "/menu";
const SETTINGS = "/menu/configuracion";
const PROGRAMS_MENU = "/menu/programas";
const RES = "/profiles/[profileId]/festivals/[festivalId]";
const FEST = "/dashboard/festivals/[id]";

/** Programs pages: admins reach them from Más, festival admins from their tab. */
const PROGRAMS_PARENT = {
  parent: PROGRAMS_MENU,
  parentFor: { festival_admin: "/dashboard/programs" },
};
/** Settings pages: a screen of their own for admins. */
const SETTINGS_PARENT = { parent: SETTINGS };
/** The two settings pages festival admins also manage, listed in their Más. */
const SHARED_SETTINGS_PARENT = {
  parent: SETTINGS,
  parentFor: { festival_admin: MENU },
};

export const SCREENS: Record<string, ScreenDef> = {
  // Más and its pages
  "/menu/programas": { title: "Programas", parent: MENU },
  "/menu/configuracion": { title: "Configuración", parent: MENU },
  "/my_orders": { title: "Mis pedidos", parent: MENU },
  "/my_credits": { title: "Mis créditos", parent: MENU },
  "/my_credits/[topUpId]": {
    title: "Compra de créditos",
    parent: "/my_credits",
  },
  "/credits_info": {
    title: "Cómo funcionan los créditos",
    parent: "/my_credits",
  },
  "/my_history": { title: "Mi historial", parent: MENU },
  "/my_programs": { title: "Mis inscripciones", parent: MENU },
  "/my_profile": { title: "Mi perfil", parent: MENU },
  "/my_profile/verification": { title: "Mi perfil", parent: "/my_profile" },
  "/my_profile/creation": { title: "Mi perfil", parent: MENU },
  "/my_notifications": { title: "Notificaciones", parent: MENU },
  "/my_notifications/[notificationId]": {
    title: "Notificación",
    parent: "/my_notifications",
  },
  "/blog": { title: "Blog", parent: MENU },
  "/blog/[slug]": { title: "Artículo", parent: "/blog" },
  "/blog/category/[slug]": { title: "Categoría", parent: "/blog" },
  "/blog/tag/[slug]": { title: "Etiqueta", parent: "/blog" },
  "/blog/compartido/[token]": { title: "Artículo", parent: "/blog" },
  "/programs": { title: "Charlas y talleres", parent: MENU },
  "/programs/[slug]": { title: "Programa", parent: "/programs" },
  "/programs/[slug]/[sessionSlug]": {
    title: "Sesión",
    parent: "/programs/[slug]",
  },
  "/programs/sessions/[slug]": { title: "Sesión", parent: "/programs" },
  "/programs/purchases/[id]": {
    title: "Tu inscripción",
    parent: "/my_programs",
  },

  // Inicio
  "/portal/blog": { title: "Mis artículos", parent: "tab:home" },
  "/portal/blog/[id]/edit": { title: "Artículo", parent: "/portal/blog" },
  "/live-acts": { title: "Presentaciones en vivo", parent: "tab:home" },
  // The public address of /live-acts (a rewrite in next.config.ts).
  "/presentaciones-en-vivo": {
    title: "Presentaciones en vivo",
    parent: "tab:home",
  },
  // Tab pages for participants; staff reach them as any other page.
  "/merch": { title: "Merch", parent: "tab:home" },
  "/supplies": { title: "Mercadito de Insumos", parent: "tab:home" },
  "/email/unsubscribe": { title: "Darse de baja", parent: "tab:home" },
  "/visitors/tickets": { title: "Mis entradas", parent: "tab:home" },

  // Participaciones
  "/my_participations/activities": {
    title: "Actividades",
    parent: "/my_participations",
  },
  "/my_participations/programs": {
    title: "Charlas y talleres",
    parent: "/my_participations",
  },
  "/my_participations/schedule": {
    title: "Horarios",
    parent: "/my_participations",
  },
  "/my_participations/team": { title: "Equipo", parent: "/my_participations" },
  "/my_participations/submit_products": {
    title: "Productos",
    parent: "/my_participations",
  },
  [`${RES}/activity`]: { title: "Actividad", parent: "/my_participations" },
  [`${RES}/activity/[activityId]`]: {
    title: "Actividad",
    parent: "/my_participations/activities",
  },
  [`${RES}/activity/[activityId]/voting`]: {
    title: "Votación",
    parent: `${RES}/activity/[activityId]`,
  },
  [`${RES}/activity/enroll`]: {
    title: "Inscripción",
    parent: `${RES}/activity`,
  },
  [`${RES}/activity/enroll/success`]: {
    title: "Inscripción",
    parent: "/my_participations",
    toParent: true,
  },
  [`${RES}/invoices`]: { title: "Pagos", parent: "/my_participations" },
  [`${RES}/terms`]: {
    title: "Términos y condiciones",
    parent: "/my_participations",
  },
  [`${RES}/reservations/intro`]: {
    title: "Reserva",
    parent: "/my_participations",
  },
  [`${RES}/reservations/new`]: {
    title: "Reservar espacio",
    parent: "/my_participations",
    close: true,
  },
  [`${RES}/reservations/new/sectors/[sectorId]/confirm/[holdId]`]: {
    title: "Confirmar espacio",
    parent: `${RES}/reservations/new`,
  },
  [`${RES}/reservations/[reservationId]`]: {
    title: "Tu reserva",
    parent: "/my_participations",
  },
  [`${RES}/reservations/[reservationId]/payments`]: {
    title: "Pago de la reserva",
    parent: `${RES}/reservations/[reservationId]`,
    close: true,
  },
  "/profiles/[profileId]/invoices/[invoiceId]/success": {
    title: "Pago",
    parent: "/my_participations",
    toParent: true,
  },
  "/profiles/[profileId]/participations": {
    title: "Participaciones",
    parent: "/my_history",
  },
  "/profiles/[profileId]/infractions": {
    title: "Infracciones",
    parent: "/my_history",
  },
  "/profiles/[profileId]/participations/[participationId]/products": {
    title: "Productos subidos",
    parent: "/my_history",
  },

  // Festivales
  "/festivals/[id]": { title: "Festival", parent: "tab:festival" },
  "/festivals/[id]/map": { title: "Mapa", parent: "/festivals/[id]" },
  "/festivals/[id]/terms": {
    title: "Términos y condiciones",
    parent: "tab:festival",
  },
  "/festivals/[id]/activity/[activityId]": {
    title: "Actividad",
    parent: "/festivals/[id]",
  },
  "/festivals/[id]/activity/[activityId]/voting": {
    title: "Votación",
    parent: "/festivals/[id]/activity/[activityId]",
  },
  "/festivals/categories": { title: "Categorías", parent: "tab:festival" },
  "/festivals/festicker": { title: "Festicker", parent: "tab:festival" },
  "/public_profiles/[id]": { title: "Perfil", parent: "tab:festival" },

  // Tiendita
  "/merch/collections/[slug]": { title: "Colección", parent: "/merch" },
  "/merch/combos/[slug]": { title: "Combo", parent: "/merch" },
  "/store/products/[slug]": { title: "Producto", parent: "/merch" },
  "/checkout": { title: "Confirmar pedido", parent: "/merch", close: true },
  "/orders/[orderId]": { title: "Pedido", parent: "/my_orders" },
  // Checkout is over by then: the X leads to the order, not back into it.
  "/orders/[orderId]/payment": {
    title: "Pagar pedido",
    parent: "/orders/[orderId]",
    close: true,
    toParent: true,
  },
  "/profiles/[profileId]/orders/[orderId]": {
    title: "Pedido",
    parent: "/my_orders",
  },
  "/profiles/[profileId]/orders/[orderId]/edit": {
    title: "Editar pedido",
    parent: "/profiles/[profileId]/orders/[orderId]",
  },

  // Staff: the festival
  "/dashboard/festivals": { title: "Festivales", parent: "tab:festival" },
  "/dashboard/festivals/add": {
    title: "Nuevo festival",
    parent: "/dashboard/festivals",
  },
  [FEST]: { title: "Festival", parent: "/dashboard/festivals" },
  [`${FEST}/edit`]: { title: "Editar festival", parent: FEST },
  [`${FEST}/tickets`]: { title: "Entradas", parent: FEST },
  [`${FEST}/tickets/list`]: { title: "Entradas", parent: FEST },
  [`${FEST}/tickets/verification`]: {
    title: "Verificar entradas",
    parent: FEST,
  },
  [`${FEST}/festival_activities`]: { title: "Actividades", parent: FEST },
  [`${FEST}/festival_activities/new`]: {
    title: "Nueva actividad",
    parent: `${FEST}/festival_activities`,
  },
  [`${FEST}/festival_activities/[activityId]`]: {
    title: "Actividad",
    parent: `${FEST}/festival_activities`,
  },
  [`${FEST}/festival_activities/[activityId]/edit`]: {
    title: "Editar actividad",
    parent: `${FEST}/festival_activities/[activityId]`,
  },
  [`${FEST}/festival_activities/[activityId]/results`]: {
    title: "Resultados",
    parent: `${FEST}/festival_activities/[activityId]`,
  },
  [`${FEST}/festival_activities/[activityId]/review`]: {
    title: "Revisión",
    parent: `${FEST}/festival_activities/[activityId]`,
  },
  [`${FEST}/festival_activities/[activityId]/review/couponbook`]: {
    title: "Couponbook",
    parent: `${FEST}/festival_activities/[activityId]/review`,
  },
  [`${FEST}/participants`]: { title: "Participantes", parent: FEST },
  [`${FEST}/reservations`]: { title: "Reservas y cobros", parent: FEST },
  [`${FEST}/reservations/new`]: {
    title: "Agregar reserva",
    parent: `${FEST}/reservations`,
    close: true,
  },
  [`${FEST}/collaborators`]: { title: "Colaboradores", parent: FEST },
  [`${FEST}/allowed_participants`]: {
    title: "Participantes habilitados",
    parent: FEST,
  },
  [`${FEST}/map`]: { title: "Mapa", parent: FEST },
  [`${FEST}/stands`]: { title: "Editor del mapa", parent: FEST },
  [`${FEST}/stands/manage`]: { title: "Gestionar espacios", parent: FEST },
  [`${FEST}/stands/subcategories`]: { title: "Subcategorías", parent: FEST },
  "/dashboard/reservations/[id]/edit": {
    title: "Editar reserva",
    parent: "tab:festival",
  },

  // Staff: the store (its sections are the Tienda tab itself)
  "/dashboard/store/orders/[id]": {
    title: "Pedido",
    parent: "/dashboard/store/orders",
  },
  "/dashboard/store/orders/[id]/edit": {
    title: "Modificar pedido",
    parent: "/dashboard/store/orders/[id]",
  },
  "/dashboard/store/orders/[id]/return": {
    title: "Registrar devolución",
    parent: "/dashboard/store/orders/[id]",
  },
  "/dashboard/store/products/add": {
    title: "Agregar producto",
    parent: "/dashboard/store/products",
  },
  "/dashboard/store/products/[id]/edit": {
    title: "Editar producto",
    parent: "/dashboard/store/products",
  },
  "/dashboard/store/collections/add": {
    title: "Crear colección",
    parent: "/dashboard/store/collections",
  },
  "/dashboard/store/collections/[id]/edit": {
    title: "Editar colección",
    parent: "/dashboard/store/collections",
  },
  "/dashboard/store/bundles/add": {
    title: "Crear combo",
    parent: "/dashboard/store/bundles",
  },
  "/dashboard/store/bundles/[id]/edit": {
    title: "Editar combo",
    parent: "/dashboard/store/bundles",
  },
  "/dashboard/store/settings/historical-line-categories": {
    title: "Categorías históricas",
    parent: "/dashboard/store/settings",
  },

  // Staff: programs
  "/dashboard/programs": { title: "Programas", parent: PROGRAMS_MENU },
  "/dashboard/programs/new": {
    title: "Nuevo programa",
    parent: "/dashboard/programs",
  },
  "/dashboard/programs/[id]": {
    title: "Programa",
    parent: "/dashboard/programs",
  },
  "/dashboard/programs/[id]/enrollments": {
    title: "Inscritos",
    parent: "/dashboard/programs/[id]",
  },
  "/dashboard/programs/[id]/sessions/new": {
    title: "Nueva sesión",
    parent: "/dashboard/programs/[id]",
  },
  "/dashboard/programs/[id]/sessions/[sessionId]": {
    title: "Sesión",
    parent: "/dashboard/programs/[id]",
  },
  "/dashboard/programs/sessions/new": {
    title: "Nueva charla o taller",
    parent: "/dashboard/programs",
  },
  "/dashboard/programs/sessions/[sessionId]": {
    title: "Sesión",
    parent: "/dashboard/programs",
  },
  "/dashboard/programs/occurrences/[occurrenceId]": {
    title: "Fecha",
    parent: "/dashboard/programs",
  },
  "/dashboard/programs/occurrences/[occurrenceId]/check-in": {
    title: "Registrar ingresos",
    parent: "/dashboard/programs/occurrences/[occurrenceId]",
  },
  "/dashboard/programs/check-in": {
    title: "Registrar ingresos",
    ...PROGRAMS_PARENT,
  },
  "/dashboard/programs/enrollments": {
    title: "Inscripciones",
    ...PROGRAMS_PARENT,
  },
  "/dashboard/programs/purchases": {
    title: "Pagos por revisar",
    ...PROGRAMS_PARENT,
  },
  "/dashboard/programs/purchases/[purchaseId]": {
    title: "Inscripción",
    parent: "/dashboard/programs/purchases",
  },
  "/dashboard/programs/promo-codes": {
    title: "Códigos promocionales",
    ...PROGRAMS_PARENT,
  },
  "/dashboard/programs/promo-codes/new": {
    title: "Nuevo código",
    parent: "/dashboard/programs/promo-codes",
  },
  "/dashboard/programs/promo-codes/[promoCodeId]": {
    title: "Código",
    parent: "/dashboard/programs/promo-codes",
  },
  "/dashboard/programs/speakers": { title: "Expositores", ...PROGRAMS_PARENT },
  "/dashboard/programs/venues": { title: "Lugares", ...PROGRAMS_PARENT },

  // Staff: people
  "/dashboard/users": { title: "Participantes", parent: MENU },
  "/dashboard/users/[profileId]": {
    title: "Perfil",
    parent: "/dashboard/users",
  },
  "/dashboard/users/[profileId]/edit-categories": {
    title: "Categorías",
    parent: "/dashboard/users/[profileId]",
  },
  "/dashboard/users/[profileId]/requests": {
    title: "Solicitudes",
    parent: "/dashboard/users/[profileId]",
  },
  "/dashboard/profile_requests": {
    title: "Solicitudes de perfil",
    parent: MENU,
  },
  "/dashboard/infractions": { title: "Infracciones", parent: MENU },
  "/dashboard/infractions/types": {
    title: "Tipos de infracción",
    parent: "/dashboard/infractions",
  },
  "/dashboard/infractions/[id]": {
    title: "Infracción",
    parent: "/dashboard/infractions",
  },
  "/dashboard/sanctions/[id]": {
    title: "Sanción",
    parent: "/dashboard/infractions",
  },
  "/dashboard/credits": { title: "Créditos", parent: MENU },
  "/dashboard/credits/reviews": { title: "Créditos", parent: MENU },
  "/dashboard/credits/accounts": { title: "Créditos", parent: MENU },
  "/dashboard/credits/accounts/[userId]": {
    title: "Saldo",
    parent: "/dashboard/credits/accounts",
  },
  "/dashboard/credits/ledger": { title: "Créditos", parent: MENU },
  "/dashboard/credits/debts": { title: "Créditos", parent: MENU },
  "/dashboard/credits/gifts": { title: "Créditos", parent: MENU },
  "/dashboard/credits/gifts/new": {
    title: "Regalar créditos",
    parent: "/dashboard/credits/gifts",
  },
  "/dashboard/credits/gifts/[giftId]": {
    title: "Regalo",
    parent: "/dashboard/credits/gifts",
  },
  "/dashboard/communications": { title: "Comunicaciones", parent: MENU },
  "/dashboard/communications/[id]": {
    title: "Comunicado",
    parent: "/dashboard/communications",
  },
  "/dashboard/communications/[id]/edit": {
    title: "Editar comunicado",
    parent: "/dashboard/communications/[id]",
  },
  "/dashboard/communications/lists": { title: "Comunicaciones", parent: MENU },
  "/dashboard/communications/lists/new": {
    title: "Nueva lista",
    parent: "/dashboard/communications/lists",
  },
  "/dashboard/communications/lists/[listId]": {
    title: "Lista",
    parent: "/dashboard/communications/lists",
  },
  "/dashboard/communications/lists/festival/[festivalId]": {
    title: "Lista del festival",
    parent: "/dashboard/communications/lists",
  },
  "/dashboard/external_participants": {
    title: "Participantes externos",
    parent: MENU,
  },
  "/dashboard/external_participants/add": {
    title: "Agregar participante externo",
    parent: "/dashboard/external_participants",
  },
  "/dashboard/external_participants/[id]/edit": {
    title: "Editar participante externo",
    parent: "/dashboard/external_participants",
  },
  "/dashboard/badges": { title: "Medallas", parent: MENU },
  "/dashboard/badges/add": {
    title: "Agregar medalla",
    parent: "/dashboard/badges",
  },
  "/dashboard/requests": { title: "Solicitudes", parent: MENU },

  // Staff: settings
  "/dashboard/categories": { title: "Categorías", ...SETTINGS_PARENT },
  "/dashboard/categories/new": {
    title: "Nueva categoría",
    parent: "/dashboard/categories",
  },
  "/dashboard/categories/[id]/edit": {
    title: "Editar categoría",
    parent: "/dashboard/categories",
  },
  "/dashboard/terms": { title: "Términos y condiciones", ...SETTINGS_PARENT },
  "/dashboard/terms/edit": {
    title: "Editar borrador",
    parent: "/dashboard/terms",
  },
  "/dashboard/terms/versions/[id]": {
    title: "Versión",
    parent: "/dashboard/terms",
  },
  "/dashboard/tags": { title: "Etiquetas", ...SETTINGS_PARENT },
  "/dashboard/discount_codes": {
    title: "Códigos de descuento",
    ...SETTINGS_PARENT,
  },
  "/dashboard/discount_codes/add": {
    title: "Nuevo código de descuento",
    parent: "/dashboard/discount_codes",
  },
  "/dashboard/discount_codes/[id]/edit": {
    title: "Editar código de descuento",
    parent: "/dashboard/discount_codes",
  },
  "/dashboard/qr_codes": { title: "Códigos QR", ...SETTINGS_PARENT },
  "/dashboard/qr_codes/add": {
    title: "Agregar código QR",
    parent: "/dashboard/qr_codes",
  },
  "/dashboard/qr_codes/[id]/edit": {
    title: "Editar código QR",
    parent: "/dashboard/qr_codes",
  },
  "/dashboard/live-acts": {
    title: "Presentaciones en vivo",
    ...SETTINGS_PARENT,
  },
  "/dashboard/feature_flags": { title: "Funcionalidades", ...SETTINGS_PARENT },
  "/dashboard/emails": { title: "Correos bloqueados", ...SETTINGS_PARENT },
  "/dashboard/blog": { title: "Blog", ...SETTINGS_PARENT },
  "/dashboard/blog/review": {
    title: "Cola de revisión",
    parent: "/dashboard/blog",
  },
  "/dashboard/blog/categories": {
    title: "Categorías del blog",
    parent: "/dashboard/blog",
  },
  "/dashboard/blog/[id]/edit": { title: "Artículo", parent: "/dashboard/blog" },
  "/dashboard/banners": { title: "Carrusel inicio", ...SHARED_SETTINGS_PARENT },
  "/dashboard/banners/new": {
    title: "Nuevo banner",
    parent: "/dashboard/banners",
  },
  "/dashboard/banners/[id]/edit": {
    title: "Editar banner",
    parent: "/dashboard/banners",
  },
  "/dashboard/landing": {
    title: "Contenido de inicio",
    ...SHARED_SETTINGS_PARENT,
  },
};

/** The admin store's sections: each one is the Tienda tab itself. */
const STAFF_STORE_ROOTS = [
  "/dashboard/store/analytics",
  "/dashboard/store/payments",
  "/dashboard/store/orders",
  "/dashboard/store/products",
  "/dashboard/store/collections",
  "/dashboard/store/bundles",
  "/dashboard/store/rentals",
  "/dashboard/store/settings",
];

export type Screen = {
  title: string;
  parentHref: string;
  close: boolean;
  toParent: boolean;
};

export type ScreenContext = {
  viewer: NavViewer | null;
  tabs: NavLink[];
  /** The festival in progress: its page is the Festival tab's own page. */
  activeFestival?: Pick<StaffFestival, "id"> | null;
};

type Compiled = {
  pattern: string;
  segments: string[];
  key: string;
  def: ScreenDef;
};

function splitPath(path: string) {
  return path.split("/").filter(Boolean);
}

const COMPILED: Compiled[] = Object.entries(SCREENS)
  .map(([pattern, def]) => ({ pattern, segments: splitPath(pattern), def }))
  // A literal segment beats a parameter in the same place, so
  // /dashboard/programs/check-in is never read as a program id: "0" marks a
  // literal and "1" a parameter, and the keys sort literal-first.
  .map((entry) => ({
    ...entry,
    key: entry.segments.map((s) => (s.startsWith("[") ? "1" : "0")).join(""),
  }))
  .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

function matchPattern(
  segments: string[],
  pathSegments: string[],
): Record<string, string> | null {
  if (segments.length !== pathSegments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.startsWith("[") && segment.endsWith("]")) {
      params[segment.slice(1, -1)] = pathSegments[i];
    } else if (segment !== pathSegments[i]) {
      return null;
    }
  }
  return params;
}

function findScreen(pathname: string) {
  const pathSegments = splitPath(pathname);
  for (const entry of COMPILED) {
    const params = matchPattern(entry.segments, pathSegments);
    if (params) return { def: entry.def, params };
  }
  return null;
}

function tabHref(ctx: ScreenContext, key: string) {
  const tab = ctx.tabs.find((candidate) => candidate.key === key);
  if (tab) return tab.href;
  // Participants call it Participaciones or Festivales by who they are.
  if (key === "festival") {
    const festival = ctx.tabs.find((candidate) =>
      ["festival", "participations", "festivals"].includes(candidate.key),
    );
    if (festival) return festival.href;
  }
  return ctx.tabs[0]?.href ?? "/";
}

/** The page a tab really lands on, when its own href only redirects there. */
function festivalTabLanding(ctx: ScreenContext): string | null {
  const staff =
    ctx.viewer?.role === "admin" || ctx.viewer?.role === "festival_admin";
  if (staff) {
    return ctx.activeFestival
      ? `/dashboard/festivals/${ctx.activeFestival.id}`
      : "/dashboard/festivals";
  }
  // Festivales sends everyone but verified participants to the festival in
  // progress, while there is one.
  const festivalsTab = ctx.tabs.find((tab) => tab.key === "festivals");
  if (festivalsTab && ctx.activeFestival) {
    return `/festivals/${ctx.activeFestival.id}`;
  }
  return null;
}

/** Whether the path is a tab's own page, which keeps the regular header. */
export function isTabRoot(pathname: string, ctx: ScreenContext): boolean {
  const path = normalize(pathname);
  if (path === "/") return true;
  for (const tab of ctx.tabs) {
    if (normalize(tab.href) === path) return true;
    if (tab.children?.some((child) => normalize(child.href) === path)) {
      return true;
    }
  }
  if (festivalTabLanding(ctx) === path) return true;
  if (ctx.viewer?.role === "admin" && STAFF_STORE_ROOTS.includes(path)) {
    return true;
  }
  return false;
}

function normalize(path: string) {
  const bare = path.split(/[?#]/)[0] ?? "/";
  return bare.length > 1 ? bare.replace(/\/+$/, "") : bare;
}

function resolveHref(
  template: string,
  params: Record<string, string>,
  ctx: ScreenContext,
) {
  if (template.startsWith("tab:")) {
    const key = template.slice(4);
    if (key === "festival") return festivalTabLanding(ctx) ?? tabHref(ctx, key);
    return tabHref(ctx, key);
  }
  return template.replace(
    /\[([^\]]+)\]/g,
    (_, name: string) => params[name] ?? "",
  );
}

/**
 * The nearest page above an unlisted path that has a place of its own, or
 * failing that the tab it belongs to.
 */
function fallbackParent(pathname: string, ctx: ScreenContext) {
  const segments = splitPath(pathname);
  for (let length = segments.length - 1; length > 0; length--) {
    const candidate = `/${segments.slice(0, length).join("/")}`;
    if (isTabRoot(candidate, ctx) || findScreen(candidate)) return candidate;
  }
  return tabHref(ctx, "home");
}

/**
 * The installed app's top bar for this path, or null on a tab's own page
 * (and for signed-out visitors, who have no app shell).
 */
export function resolveScreen(
  pathname: string,
  ctx: ScreenContext,
): Screen | null {
  if (!ctx.viewer) return null;
  return placeScreen(pathname, ctx);
}

/** Where a screen sits, for anyone: the bar needs a session, breadcrumbs do not. */
function placeScreen(pathname: string, ctx: ScreenContext): Screen | null {
  if (ctx.tabs.length === 0) return null;
  const path = normalize(pathname);
  if (isTabRoot(path, ctx)) return null;

  const found = findScreen(path);
  if (!found) {
    return {
      title: "",
      parentHref: fallbackParent(path, ctx),
      close: false,
      toParent: false,
    };
  }

  const { def, params } = found;
  const role = ctx.viewer?.role;
  const parentTemplate = (role && def.parentFor?.[role]) ?? def.parent;
  let parentHref = resolveHref(parentTemplate, params, ctx);
  // A parent that would lead straight back here (a tab whose own page
  // redirects to this one) falls back to the nearest page above.
  if (normalize(parentHref) === path) parentHref = fallbackParent(path, ctx);

  return {
    title: def.title,
    parentHref,
    close: Boolean(def.close),
    toParent: Boolean(def.toParent),
  };
}

export type Crumb = { label: string; href: string };

/** The name of a tab's own page, for the first crumb. */
function rootLabel(path: string, ctx: ScreenContext): string {
  for (const tab of ctx.tabs) {
    if (normalize(tab.href) === path) return tab.label;
    const child = tab.children?.find((item) => normalize(item.href) === path);
    if (child) return child.label;
  }
  if (festivalTabLanding(ctx) === path) {
    const festival = ctx.tabs.find((tab) =>
      ["festival", "participations", "festivals"].includes(tab.key),
    );
    if (festival) return festival.label;
  }
  if (STAFF_STORE_ROOTS.includes(path)) {
    return ctx.tabs.find((tab) => tab.key === "store")?.label ?? "Tienda";
  }
  return ctx.tabs.find((tab) => tab.key === "home")?.label ?? "Inicio";
}

/**
 * The breadcrumb trail for a page, from its tab's own page down to the page
 * itself, built from the same places as the installed app's top bar. Names
 * that depend on data come in `labels` (by href); without one, a crumb takes
 * its screen's generic title, and a crumb with no name at all is skipped.
 * Empty on a tab's own page.
 */
export function breadcrumbTrail(
  pathname: string,
  ctx: ScreenContext,
  {
    labels = {},
    current,
    parentHref: parentOverride,
  }: {
    labels?: Record<string, string>;
    /** The page's own name, when it names itself (ScreenTitle). */
    current?: string;
    /** The page's own parent, when the path cannot give it (ScreenTitle). */
    parentHref?: string;
  } = {},
): Crumb[] {
  const path = normalize(pathname);
  const here = placeScreen(path, ctx);
  if (!here) return [];

  const trail: Crumb[] = [
    { label: current ?? labels[path] ?? here.title, href: path },
  ];
  const seen = new Set([path]);
  let parentHref = parentOverride ?? here.parentHref;
  // Short and acyclic in practice; the bound only guards a mistake in SCREENS.
  for (let step = 0; step < 8; step++) {
    const parentPath = normalize(parentHref);
    if (seen.has(parentPath)) break;
    seen.add(parentPath);
    const parent = placeScreen(parentPath, ctx);
    const label =
      labels[parentHref] ??
      labels[parentPath] ??
      (parent ? parent.title : rootLabel(parentPath, ctx));
    trail.unshift({ label, href: parentHref });
    if (!parent) break;
    parentHref = parent.parentHref;
  }
  return trail.filter((crumb) => crumb.label);
}
