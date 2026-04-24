import { marketingBanners } from "@/db/schema";

export type MarketingBannerRow = typeof marketingBanners.$inferSelect;
export type MarketingBannerInsert = typeof marketingBanners.$inferInsert;

export type MarketingBannerAudience = (typeof marketingBanners.$inferSelect)["audience"];
