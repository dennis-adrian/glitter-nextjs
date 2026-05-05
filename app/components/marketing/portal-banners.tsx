import MarketingBannerCarousel from "@/app/components/marketing/marketing-banner-carousel";
import { Skeleton } from "@/app/components/ui/skeleton";
import { fetchMarketingBannersForPortal } from "@/app/lib/marketing_banners/actions";

export async function PortalBanners() {
	const banners = await fetchMarketingBannersForPortal();

	if (banners.length === 0) return null;

	return (
		<div className="w-full mt-4">
			<MarketingBannerCarousel banners={banners} />
		</div>
	);
}

export function PortalBannersSkeleton() {
	return (
		<div className="w-full mt-4">
			<Skeleton className="aspect-3/2 max-h-[240px] w-full rounded-lg md:aspect-3/1 md:max-h-[280px] lg:aspect-4/1 lg:max-h-[320px]" />
		</div>
	);
}
