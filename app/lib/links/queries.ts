import "server-only";

import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { cache } from "react";

import {
  reviveTimestamps,
  SHARED_CACHE_TAGS,
  sharedCache,
} from "@/app/lib/cache/shared";
import { db } from "@/db";
import { siteLinks, siteLinksSettings } from "@/db/schema";

import {
  DEFAULT_LINKS_HEADER,
  linksShownAt,
  toLinksHeader,
  toSocialPosition,
  type LinksHeader,
  type PublicSiteLink,
  type ScheduledPublicSiteLink,
  type SocialPosition,
} from "./definitions";

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

/** What `/links` is built from, as the cache stores it. */
type LinksPageRows = {
  /** Every link switched on, each with its schedule, in the dashboard's order. */
  links: ScheduledPublicSiteLink[];
  settings: {
    socialPosition: string;
    title: string | null;
    description: string | null;
    avatarUrl: string | null;
  } | null;
};

/**
 * The rows `/links` is built from, shared across requests. Every write from
 * the dashboard expires them at once (`invalidateLinks` in actions.ts); the
 * lifetime only bounds a change made some other way.
 *
 * The schedules are not applied here: the rows stay the same while links come
 * and go on their schedule, and the page applies them each time it renders.
 * A failed read throws, so a cached page is kept rather than replaced with an
 * empty one.
 */
const readLinksPageRows = sharedCache(
  async (): Promise<LinksPageRows> => {
    const [links, [settings]] = await Promise.all([
      db
        .select({
          id: siteLinks.id,
          kind: siteLinks.kind,
          label: siteLinks.label,
          href: siteLinks.href,
          icon: siteLinks.icon,
          iconSvg: siteLinks.iconSvg,
          imageUrl: siteLinks.imageUrl,
          layout: siteLinks.layout,
          visibleFrom: siteLinks.visibleFrom,
          visibleUntil: siteLinks.visibleUntil,
        })
        .from(siteLinks)
        .where(eq(siteLinks.isVisible, true))
        .orderBy(asc(siteLinks.sortOrder), asc(siteLinks.id)),
      db
        .select({
          socialPosition: siteLinksSettings.socialPosition,
          title: siteLinksSettings.title,
          description: siteLinksSettings.description,
          avatarUrl: siteLinksSettings.avatarUrl,
        })
        .from(siteLinksSettings)
        .limit(1),
    ]);
    return { links, settings: settings ?? null };
  },
  "links-page",
  {
    tags: [SHARED_CACHE_TAGS.siteLinks],
    revalidate: 300,
    // The schedule's dates come back from the cache as strings.
    revive: (rows) => ({
      ...rows,
      links: rows.links.map((link) => reviveTimestamps(link, siteLinks)),
    }),
  },
);

/**
 * Everything `/links` shows, as of now: the links and social icons whose
 * schedule lets them be shown (each kind in the order the dashboard set),
 * where the social icons go, and the header. Read once per render, however
 * many parts of the page (its metadata, its body) ask.
 */
export const fetchLinksPage = cache(
  async (): Promise<{
    links: PublicSiteLink[];
    socialPosition: SocialPosition;
    header: LinksHeader;
  }> => {
    const { links, settings } = await readLinksPageRows();
    return {
      links: linksShownAt(links, new Date()),
      socialPosition: toSocialPosition(settings?.socialPosition),
      header: toLinksHeader(settings),
    };
  },
);

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
 * The page's settings, read from the database as they are now, for the
 * dashboard: where the social icons go, and its header. The stock
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
 * Counts one tap on a link the page is showing. Hidden links, and links
 * outside their schedule, do not count.
 */
export async function recordSiteLinkClick(id: number): Promise<void> {
  await db
    .update(siteLinks)
    .set({ clickCount: sql`${siteLinks.clickCount} + 1` })
    .where(and(eq(siteLinks.id, id), isShownAt(new Date())));
}
