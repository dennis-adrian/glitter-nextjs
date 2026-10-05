import "server-only";

import { db } from "@/db";
import { marketingBanners } from "@/db/schema";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { MarketingBannerRow } from "./definitions";

/*
 * Banner reads for the landing page and the participant portal. Server-only,
 * not server actions: the audience is decided by the page that renders them
 * (the portal only for verified participants), never by the caller.
 */

export async function fetchMarketingBannersForLanding(
  isAuthenticated: boolean,
): Promise<MarketingBannerRow[]> {
  try {
    if (isAuthenticated) {
      return await db
        .select()
        .from(marketingBanners)
        .where(
          and(
            eq(marketingBanners.isVisible, true),
            eq(marketingBanners.audience, "all"),
          ),
        )
        .orderBy(asc(marketingBanners.sortOrder), asc(marketingBanners.id));
    }
    return await db
      .select()
      .from(marketingBanners)
      .where(
        and(
          eq(marketingBanners.isVisible, true),
          or(
            eq(marketingBanners.audience, "all"),
            eq(marketingBanners.audience, "public_only"),
          ),
        ),
      )
      .orderBy(asc(marketingBanners.sortOrder), asc(marketingBanners.id));
  } catch (error) {
    console.error("fetchMarketingBannersForLanding", error);
    return [];
  }
}

export async function fetchMarketingBannersForPortal(): Promise<
  MarketingBannerRow[]
> {
  try {
    return await db
      .select()
      .from(marketingBanners)
      .where(
        and(
          eq(marketingBanners.isVisible, true),
          inArray(marketingBanners.audience, ["all", "participants_only"]),
        ),
      )
      .orderBy(asc(marketingBanners.sortOrder), asc(marketingBanners.id));
  } catch (error) {
    console.error("fetchMarketingBannersForPortal", error);
    return [];
  }
}
