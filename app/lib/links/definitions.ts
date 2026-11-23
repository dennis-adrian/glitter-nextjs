import type { siteLinks } from "@/db/schema";

/**
 * `/links` is the page Glitter's social profiles point to in place of a
 * Linktree. Its links are rows of `site_links`, managed from
 * `/dashboard/links`.
 */
export const LINKS_PATH = "/links";
export const LINKS_ADMIN_PATH = "/dashboard/links";

export type SiteLinkRow = typeof siteLinks.$inferSelect;

/** What the public page needs of a link, and nothing else. */
export type PublicSiteLink = Pick<
  SiteLinkRow,
  "id" | "kind" | "label" | "href" | "icon" | "iconSvg" | "imageUrl" | "layout"
>;

/**
 * `link` is a card in the list. `social` is an icon in the row of social
 * profiles: one per network, with no title of its own.
 */
export const SITE_LINK_KINDS = ["link", "social"] as const;
export type SiteLinkKind = (typeof SITE_LINK_KINDS)[number];

/**
 * The featured icons: the ones the picker offers first, drawn by the app
 * itself. Any other icon of the Lucide and Simple Icons libraries can be
 * searched for; see `SiteLinkIconRef`.
 */
export const SITE_LINK_ICONS = [
  "link",
  "sparkles",
  "store",
  "website",
  "ticket",
  "calendar",
  "heart",
  "instagram",
  "tiktok",
  "facebook",
  "youtube",
  "whatsapp",
  "email",
] as const;

export type SiteLinkIcon = (typeof SITE_LINK_ICONS)[number];

export const SITE_LINK_ICON_LABELS: Record<SiteLinkIcon, string> = {
  link: "General",
  sparkles: "Destellos",
  store: "Tienda",
  website: "Sitio web",
  ticket: "Entrada",
  calendar: "Calendario",
  heart: "Corazón",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
  email: "Correo",
};

/** A stored icon name, or the plain link icon for one no longer offered. */
export function toSiteLinkIcon(value: string): SiteLinkIcon {
  return (SITE_LINK_ICONS as readonly string[]).includes(value)
    ? (value as SiteLinkIcon)
    : "link";
}

/** The libraries the picker searches beyond the featured icons. */
export const ICON_LIBRARY_SETS = ["lucide", "si"] as const;
export type IconLibrarySet = (typeof ICON_LIBRARY_SETS)[number];

/** Shown over a library's results in the picker. */
export const ICON_LIBRARY_LABELS: Record<IconLibrarySet, string> = {
  lucide: "Lucide",
  si: "Marcas",
};

const LIBRARY_ICON_RE = /^(lucide|si):([a-z0-9][a-z0-9_-]{0,63})$/;

/** `none` is a link shown with its title alone. */
export const NO_ICON = "none";

/**
 * What a link's `icon` column holds: a featured icon, an icon of a library
 * (`lucide:camera`, `si:spotify`) or `none`.
 */
export type SiteLinkIconRef =
  | SiteLinkIcon
  | `${IconLibrarySet}:${string}`
  | typeof NO_ICON;

/** The library and name of a `lucide:…` or `si:…` icon, or null. */
export function parseLibraryIcon(
  value: string,
): { set: IconLibrarySet; name: string } | null {
  const match = LIBRARY_ICON_RE.exec(value);
  return match ? { set: match[1] as IconLibrarySet, name: match[2] } : null;
}

const ICON_SVG_SHAPE = String.raw`<(?:path|circle|ellipse|line|polygon|polyline|rect)(?: (?:d|cx|cy|r|rx|ry|x|y|x1|x2|y1|y2|width|height|points|fill|stroke|transform|opacity|stroke-width|stroke-linecap|stroke-linejoin|fill-rule|clip-rule)="[^"<>&]*")*/>`;
const ICON_SVG_RE = new RegExp(
  String.raw`^<svg xmlns="http://www\.w3\.org/2000/svg" viewBox="0 0 24 24" (?:fill="currentColor"|fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round")>(?:${ICON_SVG_SHAPE}){1,64}</svg>$`,
);

/**
 * Whether `svg` is a drawing as `libraryIconSvg` writes one: an `<svg>` of
 * plain shapes with drawing attributes, and nothing else. No script, no
 * handler, no link, no style, no entity.
 *
 * A stored drawing is only ever written by the server from the icon
 * libraries' own data, so this should never say no. It is asked anyway
 * wherever a drawing is put in the page as markup, so that what the page
 * trusts is the drawing's shape and not how it came to be in the database.
 */
export function isSafeIconSvg(svg: string | null | undefined): svg is string {
  // The most detailed brand marks are some 55,000 characters of path.
  return (
    typeof svg === "string" && svg.length <= 100_000 && ICON_SVG_RE.test(svg)
  );
}

export function isFeaturedIcon(value: string): value is SiteLinkIcon {
  return (SITE_LINK_ICONS as readonly string[]).includes(value);
}

/**
 * How a link's card is drawn. `featured` shows the link's thumbnail large
 * with the title under it, for the one thing being pushed: its image, or its
 * icon when it has none. With no thumbnail at all it is drawn as `classic`.
 */
export const SITE_LINK_LAYOUTS = ["classic", "featured"] as const;
export type SiteLinkLayout = (typeof SITE_LINK_LAYOUTS)[number];

export const SITE_LINK_LAYOUT_LABELS: Record<SiteLinkLayout, string> = {
  classic: "Clásico",
  featured: "Destacado",
};

/** A stored layout, or the classic one for anything else. */
export function toSiteLinkLayout(value: string | null | undefined) {
  return value === "featured"
    ? "featured"
    : ("classic" satisfies SiteLinkLayout);
}

/** Whether a link is drawn large: it asks for it and has something to show. */
export function isFeaturedCard(
  link: Pick<SiteLinkRow, "layout" | "imageUrl" | "icon">,
): boolean {
  return (
    link.layout === "featured" &&
    (Boolean(link.imageUrl) || link.icon !== NO_ICON)
  );
}

/**
 * How a link's thumbnail is chosen in the dashboard: an image, an icon, or
 * nothing beside its title.
 */
export const THUMBNAIL_MODES = ["image", "icon", "none"] as const;
export type ThumbnailMode = (typeof THUMBNAIL_MODES)[number];

export const THUMBNAIL_MODE_LABELS: Record<ThumbnailMode, string> = {
  image: "Imagen",
  icon: "Ícono",
  none: "Ninguna",
};

/** What a link shows beside its title, from what is stored for it. */
export function thumbnailMode(
  link: Pick<SiteLinkRow, "icon" | "imageUrl">,
): ThumbnailMode {
  if (link.imageUrl) return "image";
  return link.icon === NO_ICON ? "none" : "icon";
}

export const SITE_LINK_LABEL_MAX = 80;
const HREF_MAX = 2048;

const EMAIL_RE = /^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Turns what an admin typed into the address to store: a path on this site,
 * an `http(s)` URL or a `mailto:`. A bare email becomes a `mailto:` and a bare
 * domain an `https:` URL. Any other scheme (`javascript:`, `data:`) is refused.
 */
export function parseSiteLinkHref(
  raw: string,
): { ok: true; href: string } | { ok: false; message: string } {
  const value = raw.trim();
  if (!value) return { ok: false, message: "El enlace no puede estar vacío." };
  if (value.length > HREF_MAX || /[\u0000-\u001f\u007f\s\\]/.test(value)) {
    return { ok: false, message: "El enlace no es válido." };
  }
  if (value.startsWith("/")) {
    return value.startsWith("//")
      ? { ok: false, message: "El enlace no es válido." }
      : { ok: true, href: value };
  }
  if (EMAIL_RE.test(value)) return { ok: true, href: `mailto:${value}` };

  const candidate = SCHEME_RE.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, message: "El enlace no es válido." };
  }
  if (url.protocol === "mailto:") {
    return EMAIL_RE.test(url.pathname)
      ? { ok: true, href: candidate }
      : { ok: false, message: "El correo no es válido." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return {
      ok: false,
      message:
        "Solo se permiten enlaces web (https), correos o rutas de este sitio (que empiezan con /).",
    };
  }
  if (!url.hostname.includes(".")) {
    return { ok: false, message: "El enlace no es válido." };
  }
  // The address as it was parsed, not as it was typed. `https:instagram.com/x`
  // parses to Instagram here, but a page served over https reads the same
  // text as a path of its own site: what is stored must be what was checked.
  return { ok: true, href: url.href };
}

/** Whether a link leaves this site, and so opens outside the app's router. */
export function isExternalLink(href: string) {
  return !href.startsWith("/");
}

/** The address a `mailto:` link writes to, shown under its label. */
export function mailtoAddress(href: string): string | null {
  if (!href.startsWith("mailto:")) return null;
  return href.slice("mailto:".length).split("?")[0] || null;
}

/** The networks a social icon can be for, in the order the picker offers. */
export const SOCIAL_NETWORKS = [
  "instagram",
  "tiktok",
  "facebook",
  "youtube",
  "whatsapp",
  "email",
] as const satisfies readonly SiteLinkIcon[];

export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

export function isSocialNetwork(value: string): value is SocialNetwork {
  return (SOCIAL_NETWORKS as readonly string[]).includes(value);
}

/** What the dashboard asks for each network, as Linktree does. */
export const SOCIAL_NETWORK_FIELDS: Record<
  SocialNetwork,
  { prompt: string; example: string }
> = {
  instagram: { prompt: "Usuario de Instagram", example: "@glitter.bo" },
  tiktok: { prompt: "Usuario de TikTok", example: "@glitter.bo" },
  facebook: {
    prompt: "URL de Facebook",
    example: "https://facebook.com/glitterfestival",
  },
  youtube: {
    prompt: "URL de YouTube",
    example: "https://youtube.com/@glitter",
  },
  whatsapp: {
    prompt: "Número de WhatsApp, con código de país",
    example: "+591 70000000",
  },
  email: { prompt: "Correo", example: "info@productoraglitter.com" },
};

const USERNAME_RE = /^[A-Za-z0-9._]{1,64}$/;

/** The hosts a network's own address may be on, `www.` and `m.` aside. */
const NETWORK_HOSTS: Partial<Record<SocialNetwork, readonly string[]>> = {
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
  facebook: ["facebook.com", "fb.com", "fb.me"],
  youtube: ["youtube.com", "youtu.be"],
  whatsapp: ["wa.me", "whatsapp.com", "api.whatsapp.com"],
};

function isNetworkUrl(network: SocialNetwork, href: string) {
  const host = new URL(href).hostname.replace(/^(www|m)\./, "");
  return NETWORK_HOSTS[network]?.includes(host) ?? false;
}

/**
 * Turns what an admin typed for a social icon into its address: a username
 * for Instagram and TikTok, a phone number for WhatsApp, an address for
 * email, a URL for the rest. A full URL is taken for any network, as long as
 * it is on that network's own site.
 */
export function parseSocialValue(
  network: SocialNetwork,
  raw: string,
): { ok: true; href: string } | { ok: false; message: string } {
  const value = raw.trim();
  const label = SITE_LINK_ICON_LABELS[network];
  if (!value) return { ok: false, message: "Este campo es obligatorio." };

  if (network === "email") {
    const address = value.replace(/^mailto:/i, "");
    return EMAIL_RE.test(address)
      ? { ok: true, href: `mailto:${address}` }
      : { ok: false, message: "El correo no es válido." };
  }

  const looksLikeUrl = SCHEME_RE.test(value) || value.includes("/");
  if (looksLikeUrl) {
    const parsed = parseSiteLinkHref(value);
    if (!parsed.ok || !parsed.href.startsWith("http")) {
      return { ok: false, message: "El enlace no es válido." };
    }
    return isNetworkUrl(network, parsed.href)
      ? { ok: true, href: parsed.href.replace(/^http:/, "https:") }
      : { ok: false, message: `El enlace no es de ${label}.` };
  }

  if (network === "whatsapp") {
    const digits = value.replace(/[\s()+.-]/g, "");
    return /^\d{8,15}$/.test(digits)
      ? { ok: true, href: `https://wa.me/${digits}` }
      : {
          ok: false,
          message: "Escribe el número con código de país, por ejemplo +591…",
        };
  }

  const username = value.replace(/^@/, "");
  if (!USERNAME_RE.test(username)) {
    return { ok: false, message: `El usuario de ${label} no es válido.` };
  }
  if (network === "instagram") {
    return { ok: true, href: `https://www.instagram.com/${username}` };
  }
  if (network === "tiktok") {
    return { ok: true, href: `https://www.tiktok.com/@${username}` };
  }
  if (network === "youtube") {
    return { ok: true, href: `https://www.youtube.com/@${username}` };
  }
  return { ok: true, href: `https://www.facebook.com/${username}` };
}

/**
 * What to show in the field when editing a social icon: the username, number
 * or address `parseSocialValue` would give the same link back for.
 */
export function socialValueFromHref(
  network: SocialNetwork,
  href: string,
): string {
  // All of it after `mailto:`, a subject or a body included: saving the field
  // unchanged must give back the same link. (`mailtoAddress` is the address
  // alone, for showing.)
  if (network === "email") {
    return href.startsWith("mailto:") ? href.slice("mailto:".length) : href;
  }
  const path = href.replace(/^https?:\/\/[^/]+\//, "").replace(/\/+$/, "");
  const simple = !path.includes("/") && !path.includes("?");
  if (network === "instagram" && simple && USERNAME_RE.test(path)) {
    return `@${path}`;
  }
  if (
    network === "tiktok" &&
    simple &&
    path.startsWith("@") &&
    USERNAME_RE.test(path.slice(1))
  ) {
    return path;
  }
  if (network === "whatsapp" && /^https:\/\/wa\.me\/\d+$/.test(href)) {
    return `+${path}`;
  }
  return href;
}

/** Where the row of social icons goes: under the description, or last. */
export const SOCIAL_POSITIONS = ["top", "bottom"] as const;
export type SocialPosition = (typeof SOCIAL_POSITIONS)[number];

export const SOCIAL_POSITION_LABELS: Record<SocialPosition, string> = {
  top: "Arriba",
  bottom: "Abajo",
};

/** A stored position, or the top for anything else. */
export function toSocialPosition(value: string | null | undefined) {
  return value === "bottom" ? "bottom" : ("top" satisfies SocialPosition);
}

/*
 * A link's schedule. A link may be shown only from one instant, only until
 * another, or between the two; with neither it is always shown. The switch
 * (`isVisible`) still decides first: a hidden link is hidden whatever its
 * schedule says.
 */

/** The dashboard reads and writes a schedule in Bolivia's time. */
export const LINKS_TIME_ZONE = "America/La_Paz";
/**
 * Bolivia's distance from UTC, which is all that zone is: it has no summer
 * time, and has not moved since 1932. Lets a schedule be read here and on the
 * server alike without a time zone library in the browser.
 */
const LINKS_UTC_OFFSET = "-04:00";

const SCHEDULE_INPUT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * The instant a `datetime-local` value (`2026-11-20T18:30`) names in
 * Bolivia, or null for an empty one. `undefined` for anything else.
 */
export function parseScheduleInput(
  value: string | null | undefined,
): Date | null | undefined {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (!SCHEDULE_INPUT_RE.test(trimmed)) return undefined;
  const date = new Date(`${trimmed}:00${LINKS_UTC_OFFSET}`);
  if (Number.isNaN(date.getTime())) return undefined;
  // The engine rolls an out-of-range day or hour over (`02-30` is March
  // 2nd, `24:00` the next day): a value that does not read back as itself
  // named no real moment.
  return toScheduleInput(date) === trimmed ? date : undefined;
}

const scheduleInputFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: LINKS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** An instant as the `datetime-local` value that names it in Bolivia. */
export function toScheduleInput(date: Date | null | undefined): string {
  if (!date) return "";
  // sv-SE writes "2026-11-20 18:30".
  return scheduleInputFormat.format(date).replace(" ", "T");
}

const scheduleLabelParts = {
  timeZone: LINKS_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
} as const;
const scheduleLabelFormat = new Intl.DateTimeFormat(
  "es-BO",
  scheduleLabelParts,
);
const scheduleLabelWithYearFormat = new Intl.DateTimeFormat("es-BO", {
  ...scheduleLabelParts,
  year: "numeric",
});
const scheduleYearFormat = new Intl.DateTimeFormat("en", {
  timeZone: LINKS_TIME_ZONE,
  year: "numeric",
});

/** A date for a schedule's line, with its year when that is not this one. */
function formatScheduleDate(date: Date, now: Date) {
  const sameYear =
    scheduleYearFormat.format(date) === scheduleYearFormat.format(now);
  return (sameYear ? scheduleLabelFormat : scheduleLabelWithYearFormat).format(
    date,
  );
}

export type LinkSchedule = {
  visibleFrom: Date | null;
  visibleUntil: Date | null;
};

/** Where a link is in its schedule at `now`. */
export type ScheduleState = "always" | "upcoming" | "running" | "ended";

export function scheduleState(
  { visibleFrom, visibleUntil }: LinkSchedule,
  now: Date,
): ScheduleState {
  if (!visibleFrom && !visibleUntil) return "always";
  if (visibleUntil && visibleUntil.getTime() <= now.getTime()) return "ended";
  if (visibleFrom && visibleFrom.getTime() > now.getTime()) return "upcoming";
  return "running";
}

/** Whether a link's schedule lets it be shown at `now`. */
export function isWithinSchedule(schedule: LinkSchedule, now: Date): boolean {
  const state = scheduleState(schedule, now);
  return state === "always" || state === "running";
}

/** A visible link as the public page stores it: with its schedule. */
export type ScheduledPublicSiteLink = PublicSiteLink & LinkSchedule;

/**
 * The links `/links` shows at `now`, in the order given: those whose schedule
 * has started and not ended, without the schedule itself. The rows are the
 * visible ones only; the switch is checked by the query.
 */
export function linksShownAt(
  links: ScheduledPublicSiteLink[],
  now: Date,
): PublicSiteLink[] {
  return links
    .filter((link) => isWithinSchedule(link, now))
    .map(({ id, kind, label, href, icon, iconSvg, imageUrl, layout }) => ({
      id,
      kind,
      label,
      href,
      icon,
      iconSvg,
      imageUrl,
      layout,
    }));
}

/**
 * A line for the dashboard about a link's schedule, or null when it has
 * none: "Se muestra desde el 20 nov, 18:30", "Dejó de mostrarse el …".
 */
export function scheduleLabel(
  schedule: LinkSchedule,
  now: Date,
): string | null {
  const from = schedule.visibleFrom
    ? formatScheduleDate(schedule.visibleFrom, now)
    : null;
  const until = schedule.visibleUntil
    ? formatScheduleDate(schedule.visibleUntil, now)
    : null;
  switch (scheduleState(schedule, now)) {
    case "always":
      return null;
    case "ended":
      return `Dejó de mostrarse el ${until}`;
    case "upcoming":
      return until
        ? `Se mostrará del ${from} al ${until}`
        : `Se mostrará desde el ${from}`;
    case "running":
      return until
        ? `Se muestra hasta el ${until}`
        : `Se muestra desde el ${from}`;
  }
}

/*
 * The page's header: its picture, its name and the line under it. Stored in
 * the settings row; what is not stored is the stock header below.
 */

export const DEFAULT_LINKS_TITLE = "Productora Glitter";
export const DEFAULT_LINKS_DESCRIPTION =
  "Productora de festivales para ilustradores, artistas y emprendimientos creativos";

export const LINKS_TITLE_MAX = 60;
export const LINKS_DESCRIPTION_MAX = 160;

export type LinksHeader = {
  title: string;
  /** Empty for a header with no line under the name. */
  description: string;
  /** Null for Glitter's logo. */
  avatarUrl: string | null;
};

export const DEFAULT_LINKS_HEADER: LinksHeader = {
  title: DEFAULT_LINKS_TITLE,
  description: DEFAULT_LINKS_DESCRIPTION,
  avatarUrl: null,
};

/** The header to show from what the settings row holds, if there is one. */
export function toLinksHeader(
  row:
    | {
        title: string | null;
        description: string | null;
        avatarUrl: string | null;
      }
    | null
    | undefined,
): LinksHeader {
  return {
    title: row?.title?.trim() || DEFAULT_LINKS_TITLE,
    description: row?.description ?? DEFAULT_LINKS_DESCRIPTION,
    avatarUrl: row?.avatarUrl || null,
  };
}
