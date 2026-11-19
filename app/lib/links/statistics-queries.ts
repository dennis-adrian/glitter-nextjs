import "server-only";

import { and, gte, lte, min, sql } from "drizzle-orm";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  siteLinks,
  siteLinksDailyClicks,
  siteLinksDailyViews,
} from "@/db/schema";

import { canManageLinks } from "./definitions";
import {
  buildLinksStatistics,
  linksDay,
  periodRange,
  type LinksStatistics,
  type StatsPeriod,
} from "./statistics";

/**
 * The statistics of `/links` for the last `period` days, or null for anyone
 * who may not manage the page: only admins and festival admins read them.
 */
export async function fetchLinksStatistics(
  period: StatsPeriod,
  now: Date = new Date(),
): Promise<LinksStatistics | null> {
  const profile = await getCurrentUserProfile();
  if (!profile || !canManageLinks(profile.role)) return null;

  const range = periodRange(linksDay(now), period);
  const [views, clicks, links, [viewsStart], [clicksStart]] = await Promise.all(
    [
      db
        .select({
          day: siteLinksDailyViews.day,
          source: siteLinksDailyViews.source,
          views: siteLinksDailyViews.views,
        })
        .from(siteLinksDailyViews)
        .where(
          and(
            gte(siteLinksDailyViews.day, range.previousFrom),
            lte(siteLinksDailyViews.day, range.to),
          ),
        ),
      db
        .select({
          linkId: siteLinksDailyClicks.linkId,
          day: siteLinksDailyClicks.day,
          source: siteLinksDailyClicks.source,
          clicks: sql<number>`sum(${siteLinksDailyClicks.clicks})::int`,
        })
        .from(siteLinksDailyClicks)
        .where(
          and(
            gte(siteLinksDailyClicks.day, range.previousFrom),
            lte(siteLinksDailyClicks.day, range.to),
          ),
        )
        .groupBy(
          siteLinksDailyClicks.linkId,
          siteLinksDailyClicks.day,
          siteLinksDailyClicks.source,
        ),
      db
        .select({
          id: siteLinks.id,
          kind: siteLinks.kind,
          label: siteLinks.label,
          isVisible: siteLinks.isVisible,
          visibleFrom: siteLinks.visibleFrom,
          visibleUntil: siteLinks.visibleUntil,
          clickCount: siteLinks.clickCount,
        })
        .from(siteLinks)
        .orderBy(siteLinks.kind, siteLinks.sortOrder, siteLinks.id),
      db
        .select({ day: min(siteLinksDailyViews.day) })
        .from(siteLinksDailyViews),
      db
        .select({ day: min(siteLinksDailyClicks.day) })
        .from(siteLinksDailyClicks),
    ],
  );

  const starts = [viewsStart?.day, clicksStart?.day].filter(
    (day): day is string => day != null,
  );
  return buildLinksStatistics({
    period,
    now,
    firstDay: starts.length > 0 ? starts.sort()[0] : null,
    views,
    clicks,
    links,
  });
}
