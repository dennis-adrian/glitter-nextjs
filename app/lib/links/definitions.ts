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
  "id" | "kind" | "label" | "href" | "icon"
>;

/**
 * `link` is a card in the list. `social` is an icon in the row of social
 * profiles: one per network, with no title of its own.
 */
export const SITE_LINK_KINDS = ["link", "social"] as const;
export type SiteLinkKind = (typeof SITE_LINK_KINDS)[number];

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
  return { ok: true, href: candidate };
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
  if (network === "email") return mailtoAddress(href) ?? href;
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
