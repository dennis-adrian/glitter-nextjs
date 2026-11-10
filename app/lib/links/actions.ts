"use server";

import { and, asc, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { siteLinks, siteLinksSettings } from "@/db/schema";

import {
  LINKS_ADMIN_PATH,
  LINKS_PATH,
  SITE_LINK_ICONS,
  SITE_LINK_ICON_LABELS,
  SITE_LINK_KINDS,
  SITE_LINK_LABEL_MAX,
  SOCIAL_POSITIONS,
  isSocialNetwork,
  parseSiteLinkHref,
  parseSocialValue,
  type SiteLinkIcon,
  type SiteLinkKind,
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
  icon: SiteLinkIcon;
};

function validateInput(
  data: SiteLinkInput,
):
  | { ok: true; label: string; href: string; icon: SiteLinkIcon }
  | { ok: false; message: string } {
  const label = data.label?.trim() ?? "";
  if (!label) return { ok: false, message: "El título es obligatorio." };
  if (label.length > SITE_LINK_LABEL_MAX) {
    return {
      ok: false,
      message: `El título no puede pasar de ${SITE_LINK_LABEL_MAX} caracteres.`,
    };
  }
  if (!SITE_LINK_ICONS.includes(data.icon)) {
    return { ok: false, message: "El ícono no es válido." };
  }
  const href = parseSiteLinkHref(data.href ?? "");
  if (!href.ok) return href;
  return { ok: true, label, href: href.href, icon: data.icon };
}

/** A new link goes last, and is visible at once. */
export async function createSiteLink(
  data: SiteLinkInput,
): Promise<ActionResult> {
  const profile = await getCurrentUserProfile();
  if (!canManageLinks(profile?.role)) {
    return { success: false, message: "No tienes permisos." };
  }
  const input = validateInput(data);
  if (!input.ok) return { success: false, message: input.message };

  await db.insert(siteLinks).values({
    kind: "link",
    label: input.label,
    href: input.href,
    icon: input.icon,
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
  const input = validateInput(data);
  if (!input.ok) return { success: false, message: input.message };

  const [updated] = await db
    .update(siteLinks)
    .set({
      label: input.label,
      href: input.href,
      icon: input.icon,
      updatedAt: new Date(),
    })
    .where(and(eq(siteLinks.id, id), eq(siteLinks.kind, "link")))
    .returning({ id: siteLinks.id });
  if (!updated) return { success: false, message: "Enlace no encontrado." };

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
    .returning({ id: siteLinks.id });
  if (deleted.length === 0) {
    return { success: false, message: "Enlace no encontrado." };
  }
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
