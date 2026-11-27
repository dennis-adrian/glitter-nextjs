import "server-only";

import { and, gte, lte, sql, type AnyColumn } from "drizzle-orm";

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
  // Days as `YYYY-MM-DD` whatever the server's DateStyle: the driver hands a
  // `date` over as the server writes it, and the days are compared as text.
  const isoDay = (day: AnyColumn) =>
    sql<string>`to_char(${day}, 'YYYY-MM-DD')`;
  // One read-only REPEATABLE READ snapshot, the statements one after another
  // on its one connection. Read apart, a link deleted between the taps and
  // the links would leave taps attributed to no link and to no deleted one.
  const { views, clicks, links, viewsStart, clicksStart } =
    await db.transaction(
      async (tx) => {
        const views = await tx
          .select({
            day: isoDay(siteLinksDailyViews.day),
            source: siteLinksDailyViews.source,
            views: siteLinksDailyViews.views,
          })
          .from(siteLinksDailyViews)
          .where(
            and(
              gte(siteLinksDailyViews.day, range.previousFrom),
              lte(siteLinksDailyViews.day, range.to),
            ),
          );
        const clicks = await tx
          .select({
            linkId: siteLinksDailyClicks.linkId,
            day: isoDay(siteLinksDailyClicks.day),
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
          );
        const links = await tx
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
          .orderBy(siteLinks.kind, siteLinks.sortOrder, siteLinks.id);
        const [viewsStart] = await tx
          .select({
            day: sql<
              string | null
            >`to_char(min(${siteLinksDailyViews.day}), 'YYYY-MM-DD')`,
          })
          .from(siteLinksDailyViews);
        const [clicksStart] = await tx
          .select({
            day: sql<
              string | null
            >`to_char(min(${siteLinksDailyClicks.day}), 'YYYY-MM-DD')`,
          })
          .from(siteLinksDailyClicks);
        return { views, clicks, links, viewsStart, clicksStart };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
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
