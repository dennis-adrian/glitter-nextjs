import "server-only";

import { eq } from "drizzle-orm";

import { hasPgErrorCode } from "@/app/lib/errors/postgres";
import { db } from "@/db";
import { siteLinkImages } from "@/db/schema";

/*
 * The files the `/links` page owns. Not a "use server" module: nothing here
 * checks who is asking, so callers authorize first.
 */

const FOREIGN_KEY_VIOLATION = "23503";

/** Records `url` as an image the links page made, so a link may show it. */
export async function recordLinkImage(url: string) {
  await db.insert(siteLinkImages).values({ url }).onConflictDoNothing();
}

/**
 * Whether a write was refused because the image it names is not one of the
 * page's: never one, or deleted since the editor showed it.
 */
export function isUnknownLinkImageError(error: unknown) {
  return hasPgErrorCode(error, FOREIGN_KEY_VIOLATION);
}

/**
 * Lets go of `url` if no link or header shows it, and answers whether it did;
 * the stored file is then the caller's to delete. The foreign keys on
 * `site_links.image_url` and `site_links_settings.avatar_url` refuse the
 * delete while either shows it, and hold a save that is adding it until the
 * delete is done, so a save cannot add an image between a check and the
 * delete. False too for an image the page never made.
 */
export async function releaseLinkImage(url: string): Promise<boolean> {
  try {
    const released = await db
      .delete(siteLinkImages)
      .where(eq(siteLinkImages.url, url))
      .returning({ url: siteLinkImages.url });
    return released.length > 0;
  } catch (error) {
    if (isUnknownLinkImageError(error)) return false;
    throw error;
  }
}
