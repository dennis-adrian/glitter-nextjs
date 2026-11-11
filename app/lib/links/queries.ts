import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { siteLinks, siteLinksSettings } from "@/db/schema";

import {
  toSocialPosition,
  type PublicSiteLink,
  type SocialPosition,
} from "./definitions";

/*
 * What the public page reads and writes. Server-only, not server actions:
 * nothing here may be called with arguments of a visitor's choosing beyond
 * the link id the click endpoint validates.
 */

/**
 * The links and social icons `/links` shows, each kind in the order the
 * dashboard set.
 */
export async function fetchVisibleSiteLinks(): Promise<PublicSiteLink[]> {
  try {
    return await db
      .select({
        id: siteLinks.id,
        kind: siteLinks.kind,
        label: siteLinks.label,
        href: siteLinks.href,
        icon: siteLinks.icon,
      })
      .from(siteLinks)
      .where(eq(siteLinks.isVisible, true))
      .orderBy(asc(siteLinks.sortOrder), asc(siteLinks.id));
  } catch (error) {
    console.error("fetchVisibleSiteLinks", error);
    return [];
  }
}

/** Where the row of social icons goes. At the top until someone moves it. */
export async function fetchSocialPosition(): Promise<SocialPosition> {
  try {
    const [row] = await db
      .select({ socialPosition: siteLinksSettings.socialPosition })
      .from(siteLinksSettings)
      .limit(1);
    return toSocialPosition(row?.socialPosition);
  } catch (error) {
    console.error("fetchSocialPosition", error);
    return "top";
  }
}

/** Counts one tap on a link the page is showing. Hidden links do not count. */
export async function recordSiteLinkClick(id: number): Promise<void> {
  await db
    .update(siteLinks)
    .set({ clickCount: sql`${siteLinks.clickCount} + 1` })
    .where(and(eq(siteLinks.id, id), eq(siteLinks.isVisible, true)));
}
