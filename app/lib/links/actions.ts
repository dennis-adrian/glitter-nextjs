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
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { siteLinks, siteLinksSettings } from "@/db/schema";

import {
  LINKS_ADMIN_PATH,
  LINKS_PATH,
  NO_ICON,
  SITE_LINK_ICON_LABELS,
  SITE_LINK_KINDS,
  SITE_LINK_LABEL_MAX,
  SITE_LINK_LAYOUTS,
  SOCIAL_POSITIONS,
  isFeaturedIcon,
  isSocialNetwork,
  parseLibraryIcon,
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
  /** `classic` when left out. `featured` needs an image. */
  layout?: SiteLinkLayout;
};

type ValidInput = {
  label: string;
  href: string;
  icon: string;
  iconSvg: string | null;
  imageUrl: string | null;
  layout: SiteLinkLayout;
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
  if (layout === "featured" && !imageUrl) {
    return {
      ok: false,
      message: "El diseño destacado necesita una imagen.",
    };
  }

  const href = parseSiteLinkHref(data.href ?? "");
  if (!href.ok) return href;
  return { ok: true, label, href: href.href, icon, iconSvg, imageUrl, layout };
}

/** Pages a person may ask for the image of, per minute. */
const LINK_IMAGES_PER_MINUTE = 10;

/**
 * Finds the image the page at `href` offers for itself and keeps a copy for
 * a link's thumbnail. Nothing is saved to a link here: the form shows the
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
  if (!/^https?:\/\//i.test(parsed.href)) {
    return {
      success: false,
      message: "Solo los enlaces web tienen una imagen propia.",
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

  try {
    const imageUrl = await importLinkImage(parsed.href);
    if (imageUrl) return { success: true, imageUrl };
  } catch (error) {
    console.error("fetchSiteLinkImage", error);
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
      updatedAt: new Date(),
    })
    .where(and(eq(siteLinks.id, id), eq(siteLinks.kind, "link")))
    .returning({ id: siteLinks.id });
  if (!updated) return { success: false, message: "Enlace no encontrado." };
  // The thumbnail it had is no longer shown anywhere.
  if (previous?.imageUrl && previous.imageUrl !== input.imageUrl) {
    await removeLinkImage(previous.imageUrl);
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
  await removeLinkImage(deleted[0].imageUrl);
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
