import "server-only";

import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  siteLinks,
  siteLinksDailyClicks,
  siteLinksDailyViews,
  siteLinksSettings,
} from "@/db/schema";

import {
  DEFAULT_LINKS_HEADER,
  toLinksHeader,
  toSocialPosition,
  type LinksHeader,
  type PublicSiteLink,
  type SocialPosition,
} from "./definitions";
import { linksDay, type LinksSource } from "./statistics";

/*
 * What the public page reads and writes. Server-only, not server actions:
 * nothing here may be called with arguments of a visitor's choosing beyond
 * the link id the click endpoint validates.
 */

/**
 * A link the page shows at `now`: its switch is on, and its schedule, if it
 * has one, has started and has not ended.
 */
function isShownAt(now: Date) {
  return and(
    eq(siteLinks.isVisible, true),
    or(isNull(siteLinks.visibleFrom), lte(siteLinks.visibleFrom, now)),
    or(isNull(siteLinks.visibleUntil), gt(siteLinks.visibleUntil, now)),
  );
}

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
        iconSvg: siteLinks.iconSvg,
        imageUrl: siteLinks.imageUrl,
        layout: siteLinks.layout,
      })
      .from(siteLinks)
      .where(isShownAt(new Date()))
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

/**
 * The page's settings: where the social icons go, and its header. The stock
 * ones until someone changes them, and if they cannot be read.
 */
export async function fetchLinksSettings(): Promise<{
  socialPosition: SocialPosition;
  header: LinksHeader;
  /**
   * When this was read, in milliseconds. The dashboard judges every link's
   * schedule at this one instant, on the server and in the browser alike.
   */
  readAt: number;
}> {
  const readAt = Date.now();
  try {
    const [row] = await db.select().from(siteLinksSettings).limit(1);
    return {
      socialPosition: toSocialPosition(row?.socialPosition),
      header: toLinksHeader(row),
      readAt,
    };
  } catch (error) {
    console.error("fetchLinksSettings", error);
    return { socialPosition: "top", header: DEFAULT_LINKS_HEADER, readAt };
  }
}

/**
 * Counts one tap on a link the page is showing: its lifetime total, and the
 * day's count for `source`. Hidden links, and links outside their schedule,
 * do not count. One statement, so the two counts cannot part ways and two
 * taps at once both land.
 */
export async function recordSiteLinkClick(
  id: number,
  source: LinksSource,
  now: Date = new Date(),
): Promise<void> {
  const day = linksDay(now);
  await db.execute(sql`
    with "hit" as (
      update ${siteLinks}
      set "click_count" = ${siteLinks.clickCount} + 1
      where ${and(eq(siteLinks.id, id), isShownAt(now))}
      returning ${siteLinks.id}
    )
    insert into ${siteLinksDailyClicks} ("link_id", "day", "source", "clicks")
    select "hit"."id", ${day}, ${source}, 1 from "hit"
    on conflict ("link_id", "day", "source")
    do update set "clicks" = ${siteLinksDailyClicks.clicks} + 1
  `);
}

/** Counts one showing of `/links`, on the day's row for `source`. */
export async function recordLinksPageView(
  source: LinksSource,
  now: Date = new Date(),
): Promise<void> {
  await db
    .insert(siteLinksDailyViews)
    .values({ day: linksDay(now), source, views: 1 })
    .onConflictDoUpdate({
      target: [siteLinksDailyViews.day, siteLinksDailyViews.source],
      set: { views: sql`${siteLinksDailyViews.views} + 1` },
    });
}
