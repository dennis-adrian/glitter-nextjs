"use server";

import { and, asc, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { libraryIconSvg } from "@/app/lib/links/icon-library";
import {
  importLinkImage,
  isStoredImageUrl,
  removeLinkImage,
} from "@/app/lib/links/thumbnail";
import { consumeActionRateLimit } from "@/app/lib/rate-limit";
import { publicBaseUrl } from "@/app/lib/urls";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { siteLinks, siteLinksSettings } from "@/db/schema";

import {
  LINKS_ADMIN_PATH,
  DEFAULT_LINKS_DESCRIPTION,
  DEFAULT_LINKS_TITLE,
  LINKS_DESCRIPTION_MAX,
  LINKS_PATH,
  LINKS_TITLE_MAX,
  NO_ICON,
  SITE_LINK_ICON_LABELS,
  SITE_LINK_KINDS,
  SITE_LINK_LABEL_MAX,
  SITE_LINK_LAYOUTS,
  SOCIAL_POSITIONS,
  isFeaturedIcon,
  isSocialNetwork,
  parseLibraryIcon,
  parseScheduleInput,
  parseSiteLinkHref,
  parseSocialValue,
  type SiteLinkKind,
  type SiteLinkLayout,
  type SiteLinkRow,
  type SocialNetwork,
  type SocialPosition,
} from "./definitions";

type ActionResult = { success: true } | { success: false; message: string };

/** The same staff who manage the home carousel and the landing content. */
function canManageLinks(role: string | null | undefined) {
  return role === "admin" || role === "festival_admin";
}

function invalidateLinks() {
  revalidatePath(LINKS_PATH, "page");
  revalidatePath(LINKS_ADMIN_PATH, "page");
}

/**
 * Deletes an image a write just let go of, unless a link or the header still
 * shows it: the actions accept any stored file, so two rows can hold the
 * same one. Runs after the write, so the row that dropped it is not counted.
 */
async function removeUnusedLinkImage(url: string | null | undefined) {
  if (!url) return;
  const [link] = await db
    .select({ id: siteLinks.id })
    .from(siteLinks)
    .where(eq(siteLinks.imageUrl, url))
    .limit(1);
  if (link) return;
  const [header] = await db
    .select({ id: siteLinksSettings.id })
    .from(siteLinksSettings)
    .where(eq(siteLinksSettings.avatarUrl, url))
    .limit(1);
  if (header) return;
  await removeLinkImage(url);
}

/** Where a new row of `kind` goes: after the last one of its kind. */
async function nextSortOrder(kind: SiteLinkKind) {
  const [{ maxOrder }] = await db
    .select({ maxOrder: max(siteLinks.sortOrder) })
    .from(siteLinks)
    .where(eq(siteLinks.kind, kind));
  return (maxOrder ?? -1) + 1;
}

/** Every link and social icon, hidden ones included, with its clicks. */
export async function listSiteLinksForAdmin(): Promise<SiteLinkRow[]> {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/sign_in");
  if (!canManageLinks(profile.role)) redirect("/");

  return db
    .select()
    .from(siteLinks)
    .orderBy(asc(siteLinks.kind), asc(siteLinks.sortOrder), asc(siteLinks.id));
}

export type SiteLinkInput = {
  label: string;
  href: string;
  /** A featured icon, `lucide:…` or `si:…` from the library, or `none`. */
  icon: string;
  /** A thumbnail shown in place of the icon; a file of ours, or none. */
  imageUrl?: string | null;
  /** `classic` when left out. */
  layout?: SiteLinkLayout;
  /**
   * The link's schedule, each end as a `datetime-local` value in Bolivia's
   * time (`2026-11-20T18:30`), or empty for an open end.
   */
  visibleFrom?: string | null;
  visibleUntil?: string | null;
};

type ValidInput = {
  label: string;
  href: string;
  icon: string;
  iconSvg: string | null;
  imageUrl: string | null;
  layout: SiteLinkLayout;
  visibleFrom: Date | null;
  visibleUntil: Date | null;
};

async function validateInput(
  data: SiteLinkInput,
): Promise<({ ok: true } & ValidInput) | { ok: false; message: string }> {
  const label = data.label?.trim() ?? "";
  if (!label) return { ok: false, message: "El título es obligatorio." };
  if (label.length > SITE_LINK_LABEL_MAX) {
    return {
      ok: false,
      message: `El título no puede pasar de ${SITE_LINK_LABEL_MAX} caracteres.`,
    };
  }

  const icon = typeof data.icon === "string" ? data.icon : "";
  // The drawing is taken from the library here, never from the caller.
  let iconSvg: string | null = null;
  if (parseLibraryIcon(icon)) {
    iconSvg = await libraryIconSvg(icon);
    if (!iconSvg) return { ok: false, message: "El ícono no es válido." };
  } else if (icon !== NO_ICON && !isFeaturedIcon(icon)) {
    return { ok: false, message: "El ícono no es válido." };
  }

  const imageUrl = data.imageUrl?.trim() || null;
  if (imageUrl && !isStoredImageUrl(imageUrl)) {
    return { ok: false, message: "La imagen no es válida." };
  }

  const layout = data.layout ?? "classic";
  if (!SITE_LINK_LAYOUTS.includes(layout)) {
    return { ok: false, message: "El diseño no es válido." };
  }
  const visibleFrom = parseScheduleInput(data.visibleFrom);
  const visibleUntil = parseScheduleInput(data.visibleUntil);
  if (visibleFrom === undefined || visibleUntil === undefined) {
    return { ok: false, message: "La fecha no es válida." };
  }
  if (visibleFrom && visibleUntil && visibleUntil <= visibleFrom) {
    return {
      ok: false,
      message: "El enlace debe dejar de mostrarse después de empezar.",
    };
  }

  const href = parseSiteLinkHref(data.href ?? "");
  if (!href.ok) return href;
  return {
    ok: true,
    label,
    href: href.href,
    icon,
    iconSvg,
    imageUrl,
    layout,
    visibleFrom,
    visibleUntil,
  };
}

/**
 * Where a page of this site (`/store`) can be read from, best first. The
 * addresses come from the deployment's settings, never from the request,
 * whose host a caller could set to somewhere else.
 *
 * This deployment's own address is tried first. A preview deployment's is
 * behind Vercel's login, where the page cannot be read, so the production
 * site is tried after it: the page is the same one there, unless it is new.
 */
function ownPageAddresses(path: string): string[] {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(
    /\/+$/,
    "",
  );
  const origins = [
    publicBaseUrl(),
    ...(production ? [`https://${production}`] : []),
  ];
  return [...new Set(origins)].map((origin) => `${origin}${path}`);
}

/** Pages a person may ask for the image of, per minute. */
const LINK_IMAGES_PER_MINUTE = 10;

/**
 * Finds the image the page at `href` offers for itself and keeps a copy for
 * a link's thumbnail. `href` is a web address or a path of this site. Nothing is saved to a link here: the form shows the
 * image, and saving the form is what puts it on the page.
 */
export async function fetchSiteLinkImage(
  href: string,
): Promise<
  { success: true; imageUrl: string } | { success: false; message: string }
> {
  const profile = await getCurrentUserProfile();
  if (!profile || !canManageLinks(profile.role)) {
    return { success: false, message: "No tienes permisos." };
  }
  const parsed = parseSiteLinkHref(typeof href === "string" ? href : "");
  if (!parsed.ok) return { success: false, message: parsed.message };
  const pageUrls = parsed.href.startsWith("/")
    ? ownPageAddresses(parsed.href)
    : [parsed.href];
  if (!pageUrls.every((url) => /^https?:\/\//i.test(url))) {
    return {
      success: false,
      message: "Un correo no tiene una imagen propia.",
    };
  }
  const allowed = await consumeActionRateLimit({
    key: `site-link-image:${profile.id}`,
    limit: LINK_IMAGES_PER_MINUTE,
    windowMs: 60_000,
  });
  if (!allowed) {
    return {
      success: false,
      message: "Demasiados intentos. Espera un momento.",
    };
  }

  for (const pageUrl of pageUrls) {
    try {
      const imageUrl = await importLinkImage(pageUrl);
      if (imageUrl) return { success: true, imageUrl };
    } catch (error) {
      console.error("fetchSiteLinkImage", error);
    }
  }
  return {
    success: false,
    message: "No encontramos una imagen en ese enlace. Puedes subir una.",
  };
}

/** A new link goes last, and is visible at once. */
export async function createSiteLink(
  data: SiteLinkInput,
): Promise<ActionResult> {
  const profile = await getCurrentUserProfile();
  if (!canManageLinks(profile?.role)) {
    return { success: false, message: "No tienes permisos." };
  }
  const input = await validateInput(data);
  if (!input.ok) return { success: false, message: input.message };

  await db.insert(siteLinks).values({
    kind: "link",
    label: input.label,
    href: input.href,
    icon: input.icon,
    iconSvg: input.iconSvg,
    imageUrl: input.imageUrl,
    layout: input.layout,
    visibleFrom: input.visibleFrom,
    visibleUntil: input.visibleUntil,
    sortOrder: await nextSortOrder("link"),
  });
  invalidateLinks();
  return { success: true };
}

/**
 * Adds a network to the row of social icons, from the username, number or
 * URL the dashboard asks for it. One icon per network.
 */
export async function createSocialLink(data: {
  network: SocialNetwork;
  value: string;
}): Promise<ActionResult> {
  const profile = await getCurrentUserProfile();
  if (!canManageLinks(profile?.role)) {
    return { success: false, message: "No tienes permisos." };
  }
  if (!isSocialNetwork(data.network)) {
    return { success: false, message: "La red no es válida." };
  }
  const parsed = parseSocialValue(data.network, data.value ?? "");
  if (!parsed.ok) return { success: false, message: parsed.message };

  const label = SITE_LINK_ICON_LABELS[data.network];
  const [existing] = await db
    .select({ id: siteLinks.id })
    .from(siteLinks)
    .where(and(eq(siteLinks.kind, "social"), eq(siteLinks.icon, data.network)))
    .limit(1);
  const taken = {
    success: false as const,
    message: `Ya hay un ícono de ${label}. Edítalo en lugar de agregar otro.`,
  };
  if (existing) return taken;

  // The check above can pass twice at once; the unique index
  // `site_links_one_social_per_network` lets only one of the two in.
  const inserted = await db
    .insert(siteLinks)
    .values({
      kind: "social",
      label,
      href: parsed.href,
      icon: data.network,
      sortOrder: await nextSortOrder("social"),
    })
    .onConflictDoNothing()
    .returning({ id: siteLinks.id });
  if (inserted.length === 0) return taken;
  invalidateLinks();
  return { success: true };
}

/** Changes where a social icon points. Its network stays what it is. */
export async function updateSocialLink(
  id: number,
  value: string,
): Promise<ActionResult> {
  const profile = await getCurrentUserProfile();
  if (!canManageLinks(profile?.role)) {
    return { success: false, message: "No tienes permisos." };
  }
  const [row] = await db
    .select({ icon: siteLinks.icon })
    .from(siteLinks)
    .where(and(eq(siteLinks.id, id), eq(siteLinks.kind, "social")))
    .limit(1);
  if (!row || !isSocialNetwork(row.icon)) {
    return { success: false, message: "Ícono no encontrado." };
  }
  const parsed = parseSocialValue(row.icon, value ?? "");
  if (!parsed.ok) return { success: false, message: parsed.message };

  await db
    .update(siteLinks)
    .set({ href: parsed.href, updatedAt: new Date() })
    .where(eq(siteLinks.id, id));
  invalidateLinks();
  return { success: true };
}

export async function updateSiteLink(
  id: number,
  data: SiteLinkInput,
): Promise<ActionResult> {
  const profile = await getCurrentUserProfile();
  if (!canManageLinks(profile?.role)) {
    return { success: false, message: "No tienes permisos." };
  }
  const input = await validateInput(data);
  if (!input.ok) return { success: false, message: input.message };

  const [previous] = await db
    .select({ imageUrl: siteLinks.imageUrl })
    .from(siteLinks)
    .where(and(eq(siteLinks.id, id), eq(siteLinks.kind, "link")))
    .limit(1);
  const [updated] = await db
    .update(siteLinks)
    .set({
      label: input.label,
      href: input.href,
      icon: input.icon,
      iconSvg: input.iconSvg,
      imageUrl: input.imageUrl,
      layout: input.layout,
      visibleFrom: input.visibleFrom,
      visibleUntil: input.visibleUntil,
      updatedAt: new Date(),
    })
    .where(and(eq(siteLinks.id, id), eq(siteLinks.kind, "link")))
    .returning({ id: siteLinks.id });
  if (!updated) return { success: false, message: "Enlace no encontrado." };
  // The thumbnail it had is no longer shown anywhere.
  if (previous?.imageUrl && previous.imageUrl !== input.imageUrl) {
    await removeUnusedLinkImage(previous.imageUrl);
  }

  invalidateLinks();
  return { success: true };
}

export async function setSiteLinkVisible(
  id: number,
  isVisible: boolean,
): Promise<ActionResult> {
  const profile = await getCurrentUserProfile();
  if (!canManageLinks(profile?.role)) {
    return { success: false, message: "No tienes permisos." };
  }
  const [updated] = await db
    .update(siteLinks)
    .set({ isVisible, updatedAt: new Date() })
    .where(eq(siteLinks.id, id))
    .returning({ id: siteLinks.id });
  if (!updated) return { success: false, message: "Enlace no encontrado." };

  invalidateLinks();
  return { success: true };
}

/** Removes the link and its click count with it. */
export async function deleteSiteLink(id: number): Promise<ActionResult> {
  const profile = await getCurrentUserProfile();
  if (!canManageLinks(profile?.role)) {
    return { success: false, message: "No tienes permisos." };
  }
  const deleted = await db
    .delete(siteLinks)
    .where(eq(siteLinks.id, id))
    .returning({ id: siteLinks.id, imageUrl: siteLinks.imageUrl });
  if (deleted.length === 0) {
    return { success: false, message: "Enlace no encontrado." };
  }
  await removeUnusedLinkImage(deleted[0].imageUrl);
  invalidateLinks();
  return { success: true };
}

/**
 * `orderedIds` must be every row of `kind` exactly once, in its new order.
 * Links and social icons are ordered apart.
 */
export async function reorderSiteLinks(
  kind: SiteLinkKind,
  orderedIds: number[],
): Promise<ActionResult> {
  const profile = await getCurrentUserProfile();
  if (!canManageLinks(profile?.role)) {
    return { success: false, message: "No tienes permisos." };
  }
  if (!SITE_LINK_KINDS.includes(kind)) {
    return { success: false, message: "Lista inválida." };
  }

  const existing = await db
    .select({ id: siteLinks.id })
    .from(siteLinks)
    .where(eq(siteLinks.kind, kind));
  const existingIds = new Set(existing.map((row) => row.id));
  const valid =
    new Set(orderedIds).size === orderedIds.length &&
    orderedIds.length === existing.length &&
    orderedIds.every((id) => existingIds.has(id));
  // Someone else added or removed a link in the meantime.
  if (!valid) {
    return {
      success: false,
      message: "La lista cambió. Recarga la página e inténtalo de nuevo.",
    };
  }

  try {
    await db.transaction(async (tx) => {
      for (let index = 0; index < orderedIds.length; index += 1) {
        await tx
          .update(siteLinks)
          .set({ sortOrder: index })
          .where(eq(siteLinks.id, orderedIds[index]));
      }
    });
  } catch (error) {
    console.error("reorderSiteLinks", error);
    return { success: false, message: "No se pudo reordenar." };
  }
  invalidateLinks();
  return { success: true };
}

/** Moves the row of social icons above the links or below them. */
export async function setSocialPosition(
  position: SocialPosition,
): Promise<ActionResult> {
  const profile = await getCurrentUserProfile();
  if (!canManageLinks(profile?.role)) {
    return { success: false, message: "No tienes permisos." };
  }
  if (!SOCIAL_POSITIONS.includes(position)) {
    return { success: false, message: "La posición no es válida." };
  }

  // The settings are one row, written the first time something changes.
  await db
    .insert(siteLinksSettings)
    .values({ id: 1, socialPosition: position })
    .onConflictDoUpdate({
      target: siteLinksSettings.id,
      set: { socialPosition: position, updatedAt: new Date() },
    });
  invalidateLinks();
  return { success: true };
}

export type LinksHeaderInput = {
  title: string;
  /** Empty for no line under the name. */
  description: string;
  /** A picture of ours in place of the logo, or none for the logo. */
  avatarUrl?: string | null;
};

/**
 * Saves the page's header: its name, the line under it and its picture.
 * What matches the stock header is stored as nothing, so the stock one can
 * still change with the app.
 */
export async function updateLinksHeader(
  data: LinksHeaderInput,
): Promise<ActionResult> {
  const profile = await getCurrentUserProfile();
  if (!canManageLinks(profile?.role)) {
    return { success: false, message: "No tienes permisos." };
  }
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title) return { success: false, message: "El nombre es obligatorio." };
  if (title.length > LINKS_TITLE_MAX) {
    return {
      success: false,
      message: `El nombre no puede pasar de ${LINKS_TITLE_MAX} caracteres.`,
    };
  }
  const description =
    typeof data.description === "string" ? data.description.trim() : "";
  if (description.length > LINKS_DESCRIPTION_MAX) {
    return {
      success: false,
      message: `La descripción no puede pasar de ${LINKS_DESCRIPTION_MAX} caracteres.`,
    };
  }
  const avatarUrl = data.avatarUrl?.trim() || null;
  if (avatarUrl && !isStoredImageUrl(avatarUrl)) {
    return { success: false, message: "La imagen no es válida." };
  }

  const header = {
    title: title === DEFAULT_LINKS_TITLE ? null : title,
    description: description === DEFAULT_LINKS_DESCRIPTION ? null : description,
    avatarUrl,
  };
  const [previous] = await db
    .select({ avatarUrl: siteLinksSettings.avatarUrl })
    .from(siteLinksSettings)
    .limit(1);
  // The settings are one row, written the first time something changes.
  await db
    .insert(siteLinksSettings)
    .values({ id: 1, ...header })
    .onConflictDoUpdate({
      target: siteLinksSettings.id,
      set: { ...header, updatedAt: new Date() },
    });
  // The picture it had is no longer shown anywhere.
  if (previous?.avatarUrl && previous.avatarUrl !== avatarUrl) {
    await removeUnusedLinkImage(previous.avatarUrl);
  }
  invalidateLinks();
  return { success: true };
}
