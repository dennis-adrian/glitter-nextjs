import type { MarketingBannerRow } from "@/app/lib/marketing_banners/definitions";

export type ResolvedSlideImages = {
	/** < md — mobile, tablet, or desktop art */
	mobileSrc: string;
	/** md to lg-1 */
	tabletSrc: string;
	/** lg+ */
	desktopSrc: string;
};

/**
 * Desktop is always present (DB NOT NULL). Tablet/mobile may be null.
 * - Mobile viewport: mobile → tablet → desktop
 * - Tablet viewport: tablet → desktop (prefer desktop over mobile when tablet missing)
 * - Desktop: desktop only
 */
export function resolveSlideImages(banner: MarketingBannerRow): ResolvedSlideImages {
	const d = banner.imageUrl;
	const t = banner.imageUrlTablet;
	const m = banner.imageUrlMobile;

	return {
		mobileSrc: m ?? t ?? d,
		tabletSrc: t ?? d ?? m,
		desktopSrc: d,
	};
}
